// Inbound webhooks. No JWT — each is verified by a shared secret (and, for
// M-Pesa in production, Safaricom's source IPs).
import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { webhookLimiter } from '../middleware/rateLimit.js';
import { handleStkCallback } from '../services/payments.js';
import { getVoiceProvider } from '../providers/voice/index.js';
import { handleCallResult, publishCampaign } from '../engine/dialer.js';
import { addSuppression } from '../engine/suppression.js';
import { signedUrl } from '../services/storage.js';
import { audit } from '../lib/audit.js';

const router = Router();
router.use(webhookLimiter);

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const clientIp = (req) => String(req.ip || '').replace(/^::ffff:/, '');

// ---------- M-Pesa ----------
router.post('/mpesa/callback/:token', async (req, res) => {
  if (!safeEqual(req.params.token, config.mpesa.callbackToken)) {
    await audit({ ip: req.ip }, 'webhook.mpesa_rejected', { details: { reason: 'bad_token' } });
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
  }
  if (config.mpesa.enforceIpAllowlist && !config.mpesa.allowedIps.includes(clientIp(req))) {
    await audit({ ip: req.ip }, 'webhook.mpesa_rejected', {
      details: { reason: 'ip_not_allowed' },
    });
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
  }
  const r = await handleStkCallback(req.body, { ip: req.ip });
  if (!r.ok) console.warn('[mpesa] callback ignored:', r.reason);
  // Always acknowledge so Safaricom does not keep retrying.
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});
router.post('/mpesa/callback', (_req, res) =>
  res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' }),
);

// ---------- Voice ----------
function voiceAuthorized(req) {
  return safeEqual(req.query.token || req.headers['x-webhook-token'], config.voice.webhookSecret);
}

router.post('/voice/events', async (req, res) => {
  if (!voiceAuthorized(req)) return res.status(403).send('Forbidden');
  const provider = getVoiceProvider();
  const ev = provider.parseEvent(req.body || {});
  const att = ev.providerCallId
    ? await prisma.callAttempt.findUnique({
        where: { providerCallId: String(ev.providerCallId) },
        include: { campaign: { include: { recording: true, org: true } } },
      })
    : null;
  if (!att) return res.type('application/xml').send('<Response/>');

  if (ev.active) {
    // Call answered: play the message, then optionally offer press-9 opt-out.
    await prisma.callAttempt.updateMany({
      where: { id: att.id, answeredAt: null },
      data: { answeredAt: new Date() },
    });
    const { url } = await signedUrl(att.campaign.recording.storageKey, 3600);
    const dtmfUrl = `${config.publicUrl}/api/v1/webhooks/voice/dtmf?token=${encodeURIComponent(config.voice.webhookSecret)}&attempt=${att.id}`;
    const r = provider.buildAnswerResponse({
      audioUrl: url,
      optOut: att.campaign.optOutEnabled,
      orgName: att.campaign.org.name,
      dtmfUrl,
    });
    return res.type(r.contentType).send(r.body);
  }

  let outcome = ev.outcome;
  // "Message played" = the callee stayed on for the whole recording.
  if (outcome === 'answered' && ev.durationSec >= Math.floor(att.campaign.recording.durationSec)) {
    outcome = 'played';
  }
  await handleCallResult(att.id, {
    outcome,
    durationSec: ev.durationSec,
    dtmf: ev.dtmf,
    error: ev.error,
  });
  res.type('application/xml').send('<Response/>');
});

router.post('/voice/dtmf', async (req, res) => {
  if (!voiceAuthorized(req)) return res.status(403).send('Forbidden');
  const provider = getVoiceProvider();
  const attemptId = String(req.query.attempt || '');
  const digits = String(req.body?.dtmfDigits ?? req.body?.digits ?? '');
  const att = await prisma.callAttempt.findUnique({
    where: { id: attemptId },
    include: { campaign: { include: { org: true } } },
  });
  let optedOut = false;
  if (att && digits.startsWith('9') && att.campaign.optOutEnabled) {
    await addSuppression(att.orgId, att.phoneE164, 'press9', `campaign ${att.campaignId}`);
    // Count each opt-out once even if the provider retries this webhook.
    const { count } = await prisma.callAttempt.updateMany({
      where: { id: att.id, OR: [{ dtmf: null }, { NOT: { dtmf: '9' } }] },
      data: { dtmf: '9' },
    });
    if (count) {
      const campaign = await prisma.campaign.update({
        where: { id: att.campaignId },
        data: { optOuts: { increment: 1 } },
      });
      await publishCampaign(campaign);
    }
    await audit({ orgId: att.orgId }, 'suppression.press9', {
      targetType: 'call_attempt',
      targetId: att.id,
    });
    optedOut = true;
  }
  const r = provider.buildDtmfResponse({ optedOut, orgName: att?.campaign.org.name ?? '' });
  res.type(r.contentType).send(r.body);
});

export default router;
