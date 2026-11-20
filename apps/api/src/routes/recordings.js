import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { BILLING_UNIT_SECONDS, creditsPerCall } from '@1call/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { audit, ctx } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { ALLOWED_AUDIO_EXT, convertToTelephonyWav } from '../services/audio.js';
import { putObject, signedUrl } from '../services/storage.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path
      .extname(file.originalname || '')
      .slice(1)
      .toLowerCase();
    cb(null, ALLOWED_AUDIO_EXT.includes(ext));
  },
});

const serialize = (r) => ({
  id: r.id,
  name: r.name,
  durationSec: r.durationSec,
  creditsPerCall: creditsPerCall(r.durationSec),
  identifiesCaller: r.identifiesCaller,
  createdAt: r.createdAt,
});

router.get('/', async (req, res) => {
  const items = await prisma.recording.findMany({
    where: { orgId: req.user.orgId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: items.map(serialize) });
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Choose an MP3, WAV or M4A file.', 'AUDIO_MISSING');
  const body = z
    .object({
      name: z.string().trim().min(1, 'Name this recording').max(80),
      identifiesCaller: z.preprocess((v) => v === true || v === 'true', z.boolean()),
    })
    .parse(req.body ?? {});
  if (!body.identifiesCaller) {
    throw badRequest(
      'Confirm that the message says clearly who is calling.',
      'IDENTIFIES_CALLER_REQUIRED',
    );
  }
  const { buffer, durationSec, contentType } = await convertToTelephonyWav(
    req.file.buffer,
    req.file.originalname,
  );
  const key = `recordings/${req.user.orgId}/${crypto.randomUUID()}.wav`;
  await putObject(key, buffer, contentType);
  const rec = await prisma.recording.create({
    data: {
      orgId: req.user.orgId,
      name: body.name,
      storageKey: key,
      contentType,
      durationSec,
      sizeBytes: buffer.length,
      identifiesCaller: true,
    },
  });
  await audit(ctx(req), 'recording.create', {
    targetType: 'recording',
    targetId: rec.id,
    details: { durationSec },
  });
  res.status(201).json({
    recording: serialize(rec),
    warning:
      durationSec > BILLING_UNIT_SECONDS
        ? `This message is ${Math.round(durationSec)} seconds long. Each answered call will cost ${creditsPerCall(durationSec)} credits (1 credit per 30 seconds).`
        : null,
  });
});

router.get('/:id/url', async (req, res) => {
  // Admins may listen to any recording (campaign approvals).
  const where = { id: req.params.id, deletedAt: null };
  if (req.user.role !== 'admin') where.orgId = req.user.orgId;
  const rec = await prisma.recording.findFirst({ where });
  if (!rec) throw notFound('Recording not found');
  res.json(await signedUrl(rec.storageKey, 300));
});

router.delete('/:id', async (req, res) => {
  const rec = await prisma.recording.findFirst({
    where: { id: req.params.id, orgId: req.user.orgId, deletedAt: null },
  });
  if (!rec) throw notFound('Recording not found');
  // Soft delete: campaigns keep a reference for their history.
  await prisma.recording.update({ where: { id: rec.id }, data: { deletedAt: new Date() } });
  await audit(ctx(req), 'recording.delete', { targetType: 'recording', targetId: rec.id });
  res.json({ ok: true });
});

export default router;
