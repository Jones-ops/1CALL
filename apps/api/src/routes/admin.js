import { Router } from 'express';
import { z } from 'zod';
import { nairobiPeriodStarts } from '@1call/shared';
import { prisma, creditBalance, activeSubscription } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../lib/validate.js';
import { audit, ctx } from '../lib/audit.js';
import { conflict, notFound } from '../lib/errors.js';
import { serializePlan } from './billing.js';
import { serializePayment } from '../services/payments.js';
import { serializeCampaign } from '../engine/serialize.js';
import { decideApproval } from '../services/campaigns.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const revenue = async (where = {}) =>
  (
    await prisma.payment.aggregate({
      where: { status: 'succeeded', ...where },
      _sum: { amountKes: true },
    })
  )._sum.amountKes ?? 0;

router.get('/overview', async (_req, res) => {
  const now = new Date();
  const p = nairobiPeriodStarts(now);
  const [
    total,
    today,
    month,
    year,
    activeSubs,
    pending,
    failed,
    callsMade,
    failedCalls,
    activeCampaigns,
    consumed,
    minutes,
    popular,
  ] = await Promise.all([
    revenue(),
    revenue({ processedAt: { gte: p.today } }),
    revenue({ processedAt: { gte: p.month } }),
    revenue({ processedAt: { gte: p.year } }),
    prisma.subscription.findMany({
      where: { startsAt: { lte: now }, expiresAt: { gt: now } },
      distinct: ['orgId'],
      select: { orgId: true },
    }),
    prisma.payment.count({ where: { status: 'pending' } }),
    prisma.payment.count({ where: { status: 'failed' } }),
    prisma.callAttempt.count({
      where: { status: { in: ['answered', 'played', 'unanswered', 'busy', 'failed'] } },
    }),
    prisma.callAttempt.count({ where: { status: 'failed' } }),
    prisma.campaign.count({
      where: { status: { in: ['running', 'paused', 'scheduled', 'pending_approval'] } },
    }),
    prisma.creditLedger.aggregate({ where: { reason: 'call_charge' }, _sum: { delta: true } }),
    prisma.$queryRaw`SELECT COALESCE(SUM(CEIL("durationSec" / 60.0)), 0)::int AS minutes FROM "CallAttempt" WHERE status IN ('answered', 'played')`,
    prisma.payment.groupBy({
      by: ['planId'],
      where: { status: 'succeeded' },
      _count: { _all: true },
      _sum: { amountKes: true },
    }),
  ]);
  const plans = await prisma.plan.findMany({ where: { id: { in: popular.map((x) => x.planId) } } });
  const planName = Object.fromEntries(plans.map((x) => [x.id, x.name]));
  res.json({
    revenue: { total, today, month, year },
    activeSubscriptions: activeSubs.length,
    pendingPayments: pending,
    failedPayments: failed,
    platform: {
      callsMade,
      activeCampaigns,
      creditsConsumed: -(consumed._sum.delta ?? 0),
      telecomSpendKes: Math.round((minutes[0]?.minutes ?? 0) * config.voice.costKesPerMinute),
      failedCallPct: callsMade ? Math.round((failedCalls / callsMade) * 1000) / 10 : 0,
    },
    popularPlans: popular
      .map((x) => ({
        planId: x.planId,
        name: planName[x.planId] ?? '—',
        purchases: x._count._all,
        revenue: x._sum.amountKes ?? 0,
      }))
      .sort((a, b) => b.purchases - a.purchases),
  });
});

// ---- Users (customer organisations) ----
router.get(
  '/users',
  validate(z.object({ q: z.string().trim().max(100).optional() }), 'query'),
  async (req, res) => {
    const q = req.valid.query.q;
    const orgs = await prisma.organization.findMany({
      where: {
        users: { none: { role: 'admin' } },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { users: { some: { email: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { users: { where: { role: 'owner' }, take: 1, orderBy: { createdAt: 'asc' } } },
    });
    const items = await Promise.all(
      orgs.map(async (o) => {
        const [bal, sub] = await Promise.all([creditBalance(o.id), activeSubscription(o.id)]);
        const owner = o.users[0];
        return {
          id: o.id,
          orgName: o.name,
          name: owner?.name ?? '',
          email: owner?.email ?? '',
          status: o.status,
          verified: o.verified,
          plan: sub?.plan.name ?? null,
          planExpiresAt: sub?.expiresAt ?? null,
          credits: bal.available,
        };
      }),
    );
    res.json({ items });
  },
);

router.patch(
  '/users/:id',
  validate(
    z.object({
      status: z.enum(['active', 'suspended']).optional(),
      verified: z.boolean().optional(),
    }),
  ),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound('Customer not found');
    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: req.valid.body,
    });
    if (req.valid.body.status && req.valid.body.status !== org.status) {
      await audit(
        ctx(req),
        req.valid.body.status === 'suspended' ? 'admin.suspend' : 'admin.activate',
        {
          targetType: 'organization',
          targetId: org.id,
        },
      );
    }
    if (req.valid.body.verified !== undefined && req.valid.body.verified !== org.verified) {
      await audit(ctx(req), 'admin.verify', {
        targetType: 'organization',
        targetId: org.id,
        details: { verified: updated.verified },
      });
    }
    res.json({ ok: true, status: updated.status, verified: updated.verified });
  },
);

router.post(
  '/users/:id/bonus',
  validate(
    z.object({
      credits: z.number().int().min(1).max(1_000_000),
      reason: z.string().trim().min(3).max(200),
    }),
  ),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound('Customer not found');
    const entry = await prisma.creditLedger.create({
      data: {
        orgId: org.id,
        delta: req.valid.body.credits,
        reason: 'bonus',
        note: req.valid.body.reason,
        actorId: req.user.id,
      },
    });
    await audit(ctx(req), 'admin.bonus_credits', {
      targetType: 'organization',
      targetId: org.id,
      details: {
        credits: req.valid.body.credits,
        reason: req.valid.body.reason,
        ledgerId: entry.id,
      },
    });
    res.status(201).json({ ok: true, balance: await creditBalance(org.id) });
  },
);

// ---- Plans ----
const planBody = z.object({
  name: z.string().trim().min(2).max(60),
  priceKes: z.number().int().min(1).max(10_000_000),
  credits: z.number().int().min(1).max(10_000_000),
  days: z.number().int().min(1).max(3650),
  maxRecipients: z.number().int().min(1).max(10_000_000),
  concurrency: z.number().int().min(1).max(1000),
  active: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});

router.get('/plans', async (_req, res) => {
  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { priceKes: 'asc' }],
  });
  res.json({ items: plans.map(serializePlan) });
});
router.post('/plans', validate(planBody), async (req, res) => {
  const plan = await prisma.plan.create({ data: req.valid.body });
  await audit(ctx(req), 'admin.plan_create', {
    targetType: 'plan',
    targetId: plan.id,
    details: req.valid.body,
  });
  res.status(201).json({ plan: serializePlan(plan) });
});
router.patch('/plans/:id', validate(planBody.partial()), async (req, res) => {
  const before = await prisma.plan.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound('Plan not found');
  const plan = await prisma.plan.update({ where: { id: before.id }, data: req.valid.body });
  await audit(ctx(req), 'admin.plan_update', {
    targetType: 'plan',
    targetId: plan.id,
    details: { before: serializePlan(before), after: serializePlan(plan) },
  });
  res.json({ plan: serializePlan(plan) });
});
router.delete('/plans/:id', async (req, res) => {
  const plan = await prisma.plan.findUnique({ where: { id: req.params.id } });
  if (!plan) throw notFound('Plan not found');
  const used =
    (await prisma.payment.count({ where: { planId: plan.id } })) +
    (await prisma.subscription.count({ where: { planId: plan.id } }));
  if (used)
    throw conflict(
      'This plan has been purchased before. Turn it off (inactive) instead of deleting it.',
      'PLAN_IN_USE',
    );
  await prisma.plan.delete({ where: { id: plan.id } });
  await audit(ctx(req), 'admin.plan_delete', {
    targetType: 'plan',
    targetId: plan.id,
    details: { name: plan.name },
  });
  res.json({ ok: true });
});

// ---- Approvals ----
router.get('/approvals', async (_req, res) => {
  const items = await prisma.campaign.findMany({
    where: { status: 'pending_approval' },
    orderBy: { createdAt: 'asc' },
    include: {
      org: { select: { name: true, verified: true } },
      recording: { select: { name: true, durationSec: true } },
      group: { select: { name: true } },
    },
  });
  res.json({
    items: items.map((c) => ({
      ...serializeCampaign(c),
      orgName: c.org.name,
      orgVerified: c.org.verified,
    })),
  });
});
router.post(
  '/approvals/:id',
  validate(
    z.object({
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().max(300).optional(),
    }),
  ),
  async (req, res) => {
    const c = await decideApproval(req.user, req.params.id, req.valid.body, req.ip);
    res.json({ campaign: serializeCampaign(c) });
  },
);

// ---- Payments ----
router.get('/payments', async (_req, res) => {
  const items = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { plan: { select: { name: true } }, org: { select: { name: true } } },
  });
  res.json({ items: items.map(serializePayment) });
});

export default router;
