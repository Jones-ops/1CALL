import { Router } from 'express';
import { z } from 'zod';
import { prisma, activeSubscription, creditBalance } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';
import { paymentLimiter } from '../middleware/rateLimit.js';
import { initiateStkPush, serializePayment, completeMockPayment } from '../services/payments.js';

export const serializePlan = (p) => ({
  id: p.id,
  name: p.name,
  priceKes: p.priceKes,
  credits: p.credits,
  days: p.days,
  maxRecipients: p.maxRecipients,
  concurrency: p.concurrency,
  active: p.active,
  sortOrder: p.sortOrder,
});

export const plansRouter = Router();
plansRouter.use(requireAuth);
plansRouter.get('/', async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { priceKes: 'asc' }],
  });
  res.json({ items: plans.map(serializePlan) });
});

export const subscriptionRouter = Router();
subscriptionRouter.use(requireAuth);
subscriptionRouter.get('/', async (req, res) => {
  const [sub, balance] = await Promise.all([
    activeSubscription(req.user.orgId),
    creditBalance(req.user.orgId),
  ]);
  res.json({
    subscription: sub
      ? { plan: serializePlan(sub.plan), startsAt: sub.startsAt, expiresAt: sub.expiresAt }
      : null,
    balance,
  });
});

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.post(
  '/stk-push',
  paymentLimiter,
  validate(
    z.object({ planId: z.string().min(1).max(40), phone: z.string().trim().min(9).max(20) }),
  ),
  async (req, res) => {
    const p = await initiateStkPush(req.user, req.valid.body, req.ip);
    res.status(201).json({ payment: serializePayment(p) });
  },
);

paymentsRouter.get('/', async (req, res) => {
  const items = await prisma.payment.findMany({
    where: { orgId: req.user.orgId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { plan: { select: { name: true } } },
  });
  res.json({ items: items.map(serializePayment) });
});

paymentsRouter.get('/:id', async (req, res) => {
  const p = await prisma.payment.findFirst({
    where: { id: req.params.id, orgId: req.user.orgId },
    include: { plan: { select: { name: true } } },
  });
  if (!p) throw notFound('Payment not found');
  res.json({ payment: serializePayment(p) });
});

// MOCK MODE ONLY — simulates Safaricom's callback on the server.
export const mockRouter = Router();
mockRouter.use(requireAuth);
mockRouter.post('/mpesa/:paymentId/complete', paymentLimiter, async (req, res) => {
  const r = await completeMockPayment(req.user, req.params.paymentId, true);
  res.json({ ok: r.ok, status: r.status });
});
mockRouter.post('/mpesa/:paymentId/cancel', paymentLimiter, async (req, res) => {
  const r = await completeMockPayment(req.user, req.params.paymentId, false);
  res.json({ ok: r.ok, status: r.status });
});
