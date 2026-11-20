import { api, resetDb, makeCustomer, makeAdmin, balance, prisma } from './helpers.js';
import { handleStkCallback } from '../src/services/payments.js';
import { config } from '../src/config.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function start(c, plan) {
  const res = await api()
    .post('/api/v1/payments/stk-push')
    .set(c.auth)
    .send({ planId: plan.id, phone: '0712345678' })
    .expect(201);
  return prisma.payment.findUnique({ where: { id: res.body.payment.id } });
}

const callback = (p, { code = 0, amount = p.amountKes, receipt = 'QWE123RTY' } = {}) => ({
  Body: {
    stkCallback: {
      MerchantRequestID: p.merchantRequestId,
      CheckoutRequestID: p.checkoutRequestId,
      ResultCode: code,
      ResultDesc: code
        ? 'Request cancelled by user'
        : 'The service request is processed successfully.',
      CallbackMetadata: code
        ? undefined
        : {
            Item: [
              { Name: 'Amount', Value: amount },
              { Name: 'MpesaReceiptNumber', Value: receipt },
              { Name: 'PhoneNumber', Value: 254712345678 },
            ],
          },
    },
  },
});

describe('M-Pesa payments', () => {
  test('STK push validates the phone number and creates a pending payment', async () => {
    const c = await makeCustomer({ credits: 0, subscription: false });
    await api()
      .post('/api/v1/payments/stk-push')
      .set(c.auth)
      .send({ planId: c.plan.id, phone: '+447911123456' })
      .expect(400);
    const p = await start(c, c.plan);
    expect(p).toMatchObject({ status: 'pending', amountKes: 1000, phone: '+254712345678' });
    expect(p.checkoutRequestId).toBeTruthy();
    // The app polling the payment does not activate anything.
    const r = await api().get(`/api/v1/payments/${p.id}`).set(c.auth).expect(200);
    expect(r.body.payment.status).toBe('pending');
    expect((await balance(c.org.id)).available).toBe(0);
  });

  test('verified callback grants credits + subscription exactly once', async () => {
    const c = await makeCustomer({ credits: 0, subscription: false });
    const p = await start(c, c.plan);
    const body = callback(p);
    const url = `/api/v1/webhooks/mpesa/callback/${config.mpesa.callbackToken}`;
    await api().post(url).send(body).expect(200);
    await api().post(url).send(body).expect(200); // Safaricom retry
    await Promise.all([handleStkCallback(body), handleStkCallback(body)]);

    const paid = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(paid).toMatchObject({ status: 'succeeded', mpesaReceipt: 'QWE123RTY' });
    expect((await balance(c.org.id)).available).toBe(500);
    expect(await prisma.subscription.count({ where: { orgId: c.org.id } })).toBe(1);
    expect(
      await prisma.creditLedger.count({ where: { orgId: c.org.id, reason: 'purchase' } }),
    ).toBe(1);
  });

  test('callback with wrong secret token is rejected', async () => {
    const c = await makeCustomer({ credits: 0, subscription: false });
    const p = await start(c, c.plan);
    await api().post('/api/v1/webhooks/mpesa/callback/wrong-token').send(callback(p)).expect(403);
    await api().post('/api/v1/webhooks/mpesa/callback').send(callback(p)).expect(403);
    expect((await prisma.payment.findUnique({ where: { id: p.id } })).status).toBe('pending');
  });

  test('amount mismatch and user cancellation fail without credits', async () => {
    const c = await makeCustomer({ credits: 0, subscription: false });
    const p1 = await start(c, c.plan);
    await handleStkCallback(callback(p1, { amount: 1 }));
    expect((await prisma.payment.findUnique({ where: { id: p1.id } })).status).toBe('failed');
    const p2 = await start(c, c.plan);
    await handleStkCallback(callback(p2, { code: 1032 }));
    expect((await prisma.payment.findUnique({ where: { id: p2.id } })).status).toBe('failed');
    expect((await balance(c.org.id)).available).toBe(0);
  });

  test('mock endpoints simulate PIN entry / cancel through the same server callback', async () => {
    const c = await makeCustomer({ credits: 0, subscription: false });
    const p = await start(c, c.plan);
    const other = await makeCustomer();
    await api().post(`/api/v1/mock/mpesa/${p.id}/complete`).set(other.auth).expect(404);
    await api().post(`/api/v1/mock/mpesa/${p.id}/complete`).set(c.auth).expect(200);
    await api().post(`/api/v1/mock/mpesa/${p.id}/complete`).set(c.auth).expect(409);
    const sub = await api().get('/api/v1/subscription').set(c.auth).expect(200);
    expect(sub.body.subscription.plan.id).toBe(c.plan.id);
    expect(sub.body.balance.available).toBe(500);

    const p2 = await start(c, c.plan);
    const r = await api().post(`/api/v1/mock/mpesa/${p2.id}/cancel`).set(c.auth).expect(200);
    expect(r.body.status).toBe('failed');
    const hist = await api().get('/api/v1/payments').set(c.auth).expect(200);
    expect(hist.body.items.map((x) => x.status).sort()).toEqual(['failed', 'succeeded']);
  });
});

describe('admin', () => {
  test('non-admins are blocked', async () => {
    const c = await makeCustomer();
    for (const path of ['/overview', '/users', '/plans', '/approvals', '/payments']) {
      await api().get(`/api/v1/admin${path}`).set(c.auth).expect(403);
    }
  });

  test('overview, bonus credits (logged), suspend, plan CRUD', async () => {
    const admin = await makeAdmin();
    const c = await makeCustomer({ credits: 0, subscription: false });
    const p = await start(c, c.plan);
    await handleStkCallback(callback(p));

    const ov = await api().get('/api/v1/admin/overview').set(admin.auth).expect(200);
    expect(ov.body.revenue.total).toBe(1000);
    expect(ov.body.revenue.today).toBe(1000);
    expect(ov.body.activeSubscriptions).toBe(1);

    await api()
      .post(`/api/v1/admin/users/${c.org.id}/bonus`)
      .set(admin.auth)
      .send({ credits: 50, reason: 'Goodwill' })
      .expect(201);
    expect((await balance(c.org.id)).available).toBe(550);
    expect(
      await prisma.auditLog.findFirst({ where: { action: 'admin.bonus_credits' } }),
    ).toBeTruthy();

    await api()
      .patch(`/api/v1/admin/users/${c.org.id}`)
      .set(admin.auth)
      .send({ status: 'suspended' })
      .expect(200);
    const users = await api().get('/api/v1/admin/users').set(admin.auth).expect(200);
    expect(users.body.items.find((u) => u.id === c.org.id)).toMatchObject({
      status: 'suspended',
      credits: 550,
    });

    const created = await api()
      .post('/api/v1/admin/plans')
      .set(admin.auth)
      .send({
        name: 'Mini',
        priceKes: 500,
        credits: 200,
        days: 7,
        maxRecipients: 200,
        concurrency: 2,
      })
      .expect(201);
    await api()
      .patch(`/api/v1/admin/plans/${created.body.plan.id}`)
      .set(admin.auth)
      .send({ active: false })
      .expect(200);
    const visible = await api().get('/api/v1/plans').set(c.auth).expect(200);
    expect(visible.body.items.find((x) => x.name === 'Mini')).toBeUndefined();
    await api().delete(`/api/v1/admin/plans/${created.body.plan.id}`).set(admin.auth).expect(200);
    await api().delete(`/api/v1/admin/plans/${c.plan.id}`).set(admin.auth).expect(409); // has payments
  });
});
