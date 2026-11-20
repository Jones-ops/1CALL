import { Router } from 'express';
import { z } from 'zod';
import { CAMPAIGN_CATEGORIES } from '@1call/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';
import { serializeCampaign } from '../engine/serialize.js';
import {
  estimateCampaign,
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
} from '../services/campaigns.js';

const router = Router();
router.use(requireAuth);

const include = {
  group: { select: { name: true } },
  recording: { select: { name: true, durationSec: true } },
};

router.get('/', async (req, res) => {
  const items = await prisma.campaign.findMany({
    where: { orgId: req.user.orgId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include,
  });
  res.json({ items: items.map(serializeCampaign) });
});

router.post(
  '/estimate',
  validate(
    z.object({ groupId: z.string().min(1).max(40), recordingId: z.string().max(40).optional() }),
  ),
  async (req, res) => {
    res.json(await estimateCampaign(req.user.orgId, req.valid.body));
  },
);

router.post(
  '/',
  validate(
    z.object({
      name: z.string().trim().min(2, 'Give the campaign a name').max(120),
      groupId: z.string().min(1).max(40),
      recordingId: z.string().min(1).max(40),
      category: z.enum(CAMPAIGN_CATEGORIES),
      scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
      optOutEnabled: z.boolean().default(true),
      declarations: z.object({ consent: z.boolean(), lawful: z.boolean() }),
    }),
  ),
  async (req, res) => {
    const c = await createCampaign(req.user, req.valid.body, req.ip);
    const full = await prisma.campaign.findUnique({ where: { id: c.id }, include });
    res.status(201).json({ campaign: serializeCampaign(full) });
  },
);

async function own(req) {
  const c = await prisma.campaign.findFirst({
    where: { id: req.params.id, orgId: req.user.orgId },
    include,
  });
  if (!c) throw notFound('Campaign not found');
  return c;
}

router.get('/:id', async (req, res) => {
  res.json({ campaign: serializeCampaign(await own(req)) });
});

router.get(
  '/:id/calls',
  validate(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      status: z
        .enum([
          'queued',
          'ringing',
          'answered',
          'played',
          'unanswered',
          'busy',
          'failed',
          'suppressed',
          'cancelled',
        ])
        .optional(),
    }),
    'query',
  ),
  async (req, res) => {
    const c = await own(req);
    const { page, status } = req.valid.query;
    const where = { campaignId: c.id };
    if (status) where.status = status;
    const pageSize = 50;
    const [total, items] = await Promise.all([
      prisma.callAttempt.count({ where }),
      prisma.callAttempt.findMany({
        where,
        orderBy: [{ endedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({
      page,
      total,
      hasMore: page * pageSize < total,
      items: items.map((a) => ({
        id: a.id,
        phone: a.phoneE164,
        name: a.contactName,
        attemptNo: a.attemptNo,
        status: a.status,
        durationSec: a.durationSec,
        creditsCharged: a.creditsCharged,
        dtmf: a.dtmf,
        endedAt: a.endedAt,
      })),
    });
  },
);

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Quote, and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^\+\d+$/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

router.get('/:id/calls.csv', async (req, res) => {
  const c = await own(req);
  const calls = await prisma.callAttempt.findMany({
    where: { campaignId: c.id },
    orderBy: [{ phoneE164: 'asc' }, { attemptNo: 'asc' }],
  });
  const header = [
    'phone',
    'name',
    'attempt',
    'status',
    'duration_sec',
    'credits_charged',
    'pressed',
    'dialed_at',
    'ended_at',
  ];
  const lines = [header.join(',')].concat(
    calls.map((a) =>
      [
        a.phoneE164,
        a.contactName,
        a.attemptNo,
        a.status,
        a.durationSec,
        a.creditsCharged,
        a.dtmf,
        a.dialedAt,
        a.endedAt,
      ]
        .map(csvCell)
        .join(','),
    ),
  );
  const fname = c.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'campaign';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}-calls.csv"`);
  res.send(lines.join('\n'));
});

router.post('/:id/pause', async (req, res) => {
  res.json({ campaign: serializeCampaign(await pauseCampaign(req.user, req.params.id, req.ip)) });
});
router.post('/:id/resume', async (req, res) => {
  res.json({ campaign: serializeCampaign(await resumeCampaign(req.user, req.params.id, req.ip)) });
});
router.post('/:id/cancel', async (req, res) => {
  res.json({ campaign: serializeCampaign(await cancelCampaign(req.user, req.params.id, req.ip)) });
});

export default router;
