import { Router } from 'express';
import { ACTIVE_CAMPAIGN_STATUSES } from '@1call/shared';
import { prisma, creditBalance, activeSubscription } from '../db.js';
import { serializeCampaign } from '../engine/serialize.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const orgId = req.user.orgId;
  const [
    balance,
    sub,
    contacts,
    totals,
    completed,
    active,
    history,
    recordings,
    campaignsTotal,
    live,
  ] = await Promise.all([
    creditBalance(orgId),
    activeSubscription(orgId),
    prisma.contact.count({ where: { orgId } }),
    prisma.campaign.aggregate({
      where: { orgId },
      _sum: { answered: true, played: true, unanswered: true, busy: true, failed: true },
    }),
    prisma.campaign.count({ where: { orgId, status: 'completed' } }),
    prisma.campaign.count({ where: { orgId, status: { in: ACTIVE_CAMPAIGN_STATUSES } } }),
    prisma.campaign.findMany({
      where: { orgId, status: { notIn: ['draft'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        name: true,
        status: true,
        answered: true,
        unanswered: true,
        busy: true,
        failed: true,
        createdAt: true,
      },
    }),
    prisma.recording.count({ where: { orgId, deletedAt: null } }),
    prisma.campaign.count({ where: { orgId } }),
    // The campaign to feature as "Live now" on the dashboard.
    prisma.campaign.findFirst({
      where: { orgId, status: { in: ACTIVE_CAMPAIGN_STATUSES } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const s = totals._sum;
  res.json({
    stats: {
      availableCredits: balance.available,
      credits: balance.credits,
      reservedCredits: balance.reserved,
      contacts,
      answered: s.answered ?? 0,
      played: s.played ?? 0,
      // Busy calls are shown under "Unanswered" (neither reached the person).
      unanswered: (s.unanswered ?? 0) + (s.busy ?? 0),
      failed: s.failed ?? 0,
      completedCampaigns: completed,
      activeCampaigns: active,
      recordings,
      campaignsTotal,
    },
    live: live ? serializeCampaign(live) : null,
    subscription: sub ? { planName: sub.plan.name, expiresAt: sub.expiresAt } : null,
    history: history.reverse().map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      answered: c.answered,
      unanswered: c.unanswered + c.busy,
      failed: c.failed,
    })),
  });
});

export default router;
