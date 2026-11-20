import { Router } from 'express';
import { prisma, creditBalance, activeSubscription } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { audit, ctx } from '../lib/audit.js';
import { publicUser } from './auth.js';
import { notFound } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { org: true } });
  if (!user) throw notFound('User not found');
  const [balance, sub] = await Promise.all([
    creditBalance(user.orgId),
    activeSubscription(user.orgId),
  ]);
  res.json({
    user: publicUser(user),
    balance,
    subscription: sub
      ? { planName: sub.plan.name, planId: sub.planId, expiresAt: sub.expiresAt }
      : null,
  });
});

// Kenya Data Protection Act 2019: data portability — export the org's data.
router.get('/export', async (req, res) => {
  const orgId = req.user.orgId;
  const [org, contacts, imports, suppressions, campaigns, payments] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.contact.findMany({ where: { orgId }, include: { group: { select: { name: true } } } }),
    prisma.contactImport.findMany({ where: { orgId } }),
    prisma.suppression.findMany({ where: { orgId } }),
    prisma.campaign.findMany({ where: { orgId } }),
    prisma.payment.findMany({ where: { orgId }, omit: { rawCallback: true } }),
  ]);
  await audit(ctx(req), 'data.export');
  res.setHeader('Content-Disposition', 'attachment; filename="1call-export.json"');
  res.json({ exportedAt: new Date(), org, contacts, imports, suppressions, campaigns, payments });
});

export default router;
