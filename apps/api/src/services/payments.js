import crypto from 'node:crypto';
import { isKenyanMobile, normalizePhone } from '@1call/shared';
import { prisma, activeSubscription } from '../db.js';
import { config } from '../config.js';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { getMpesaProvider } from '../providers/mpesa/index.js';

export const serializePayment = (p) => ({
  id: p.id,
  planId: p.planId,
  planName: p.plan?.name,
  amountKes: p.amountKes,
  phone: p.phone,
  status: p.status,
  mpesaReceipt: p.mpesaReceipt,
  resultDesc: p.resultDesc,
  createdAt: p.createdAt,
  processedAt: p.processedAt,
  orgName: p.org?.name,
  orgId: p.orgId,
});

export function mpesaCallbackUrl() {
  return `${config.publicUrl}/api/v1/webhooks/mpesa/callback/${config.mpesa.callbackToken}`;
}

export async function initiateStkPush(user, { planId, phone }, ip) {
  const org = await prisma.organization.findUnique({ where: { id: user.orgId } });
  if (org.status !== 'active') throw forbidden('Your account is suspended.', 'ORG_SUSPENDED');
  const plan = await prisma.plan.findFirst({ where: { id: planId, active: true } });
  if (!plan) throw notFound('Plan not found');
  if (!isKenyanMobile(phone)) {
    throw badRequest('Enter a Safaricom number like 0712 345 678.', 'INVALID_MPESA_PHONE');
  }
  const msisdn = normalizePhone(phone);

  const payment = await prisma.payment.create({
    data: {
      orgId: org.id,
      planId: plan.id,
      userId: user.id,
      amountKes: plan.priceKes,
      phone: msisdn,
    },
  });
  try {
    const r = await getMpesaProvider().stkPush({
      amount: plan.priceKes,
      phone: msisdn,
      accountReference: '1CALL',
      description: `${plan.name} plan`,
      callbackUrl: mpesaCallbackUrl(),
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { merchantRequestId: r.merchantRequestId, checkoutRequestId: r.checkoutRequestId },
    });
  } catch (err) {
    console.error('[mpesa] STK push failed', err.message);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'failed',
        resultDesc: 'Could not start M-Pesa payment',
        processedAt: new Date(),
      },
    });
    throw new HttpError(
      502,
      'M-Pesa is not responding. Please try again in a moment.',
      'MPESA_UNAVAILABLE',
    );
  }
  await audit({ actorId: user.id, orgId: org.id, ip }, 'payment.initiate', {
    targetType: 'payment',
    targetId: payment.id,
    details: { plan: plan.name, amountKes: plan.priceKes },
  });
  return prisma.payment.findUnique({ where: { id: payment.id }, include: { plan: true } });
}

/**
 * Process a Daraja STK callback. This is the ONLY place where a plan is
 * activated and credits are purchased. Idempotent: each payment is processed
 * exactly once, guarded by a row lock and the `pending` status.
 */
export async function handleStkCallback(body, { ip = null, now = new Date() } = {}) {
  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return { ok: false, reason: 'malformed' };
  const found = await prisma.payment.findUnique({
    where: { checkoutRequestId: String(cb.CheckoutRequestID) },
  });
  if (!found) return { ok: false, reason: 'unknown_checkout' };
  if (
    found.merchantRequestId &&
    cb.MerchantRequestID &&
    found.merchantRequestId !== cb.MerchantRequestID
  ) {
    return { ok: false, reason: 'merchant_mismatch' };
  }

  const resultCode = Number(cb.ResultCode);
  const meta = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${found.id} FOR UPDATE`;
    const p = await tx.payment.findUnique({ where: { id: found.id }, include: { plan: true } });
    if (p.status !== 'pending') return { ok: true, duplicate: true, status: p.status };

    const fail = async (desc) => {
      await tx.payment.update({
        where: { id: p.id },
        data: {
          status: 'failed',
          resultCode,
          resultDesc: desc,
          rawCallback: body,
          processedAt: now,
        },
      });
      return { ok: true, status: 'failed', reason: desc, payment: p };
    };

    if (resultCode !== 0) return fail(String(cb.ResultDesc || 'Payment was not completed'));
    if (Number(meta.Amount) !== p.amountKes) return fail(`Amount mismatch (got ${meta.Amount})`);
    const receipt = meta.MpesaReceiptNumber ? String(meta.MpesaReceiptNumber) : null;
    if (!receipt) return fail('Missing M-Pesa receipt');
    if (await tx.payment.findUnique({ where: { mpesaReceipt: receipt } }))
      return fail('Duplicate receipt');

    await tx.payment.update({
      where: { id: p.id },
      data: {
        status: 'succeeded',
        mpesaReceipt: receipt,
        resultCode,
        resultDesc: String(cb.ResultDesc || 'Success'),
        rawCallback: body,
        processedAt: now,
      },
    });
    await tx.creditLedger.create({
      data: {
        orgId: p.orgId,
        delta: p.plan.credits,
        reason: 'purchase',
        refId: p.id,
        note: p.plan.name,
      },
    });
    const current = await activeSubscription(p.orgId, tx, now);
    const base = current && current.expiresAt > now ? current.expiresAt : now;
    await tx.subscription.create({
      data: {
        orgId: p.orgId,
        planId: p.planId,
        paymentId: p.id,
        startsAt: now,
        expiresAt: new Date(base.getTime() + p.plan.days * 86400_000),
      },
    });
    return { ok: true, status: 'succeeded', payment: p };
  });

  if (!outcome.duplicate && outcome.payment) {
    await audit({ orgId: outcome.payment.orgId, ip }, `payment.${outcome.status}`, {
      targetType: 'payment',
      targetId: outcome.payment.id,
      details: {
        resultCode,
        reason: outcome.reason ?? null,
        receipt: meta.MpesaReceiptNumber ?? null,
      },
    });
  }
  return outcome;
}

/** MOCK MODE ONLY: simulate the customer entering their PIN or cancelling. */
export async function completeMockPayment(user, paymentId, success) {
  if (!config.mockPayments) throw notFound('Not available');
  const p = await prisma.payment.findFirst({ where: { id: paymentId, orgId: user.orgId } });
  if (!p) throw notFound('Payment not found');
  if (p.status !== 'pending') throw conflict('This payment has already been processed.');
  const stkCallback = {
    MerchantRequestID: p.merchantRequestId,
    CheckoutRequestID: p.checkoutRequestId,
    ResultCode: success ? 0 : 1032,
    ResultDesc: success
      ? 'The service request is processed successfully.'
      : 'Request cancelled by user',
  };
  if (success) {
    stkCallback.CallbackMetadata = {
      Item: [
        { Name: 'Amount', Value: p.amountKes },
        {
          Name: 'MpesaReceiptNumber',
          Value: `MOCK${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        },
        {
          Name: 'TransactionDate',
          Value: Number(new Date().toISOString().replace(/\D/g, '').slice(0, 14)),
        },
        { Name: 'PhoneNumber', Value: Number(p.phone.replace('+', '')) },
      ],
    };
  }
  return handleStkCallback({ Body: { stkCallback } });
}
