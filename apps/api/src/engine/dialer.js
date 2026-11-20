// The campaign dialing engine. Runs inside the worker (BullMQ tick) or, when no
// Redis is configured, inside the API process on a timer.
//
// Credit flow (all inside DB transactions, see db.js#creditBalance):
//   launch      : campaign_reserve  -R              (R = recipients × creditsPerCall)
//   answered    : call_charge       -c  and  campaign_release +c   (reserved -> charged)
//   end/cancel  : campaign_release  +remaining reservation
// Available credits never change on an answered call (it was already reserved)
// and can never go negative because launch checks available >= R under a row lock.
import { Prisma } from '@prisma/client';
import { isWithinCallingHours, nextCallingWindowStart, MAX_ATTEMPTS } from '@1call/shared';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { publish } from '../lib/events.js';
import { getVoiceProvider } from '../providers/voice/index.js';
import { suppressedSet, addSuppression } from './suppression.js';
import { serializeCampaign } from './serialize.js';

export const TERMINAL_CALL_STATUSES = new Set([
  'answered',
  'played',
  'unanswered',
  'busy',
  'failed',
  'suppressed',
  'cancelled',
]);
const OUTCOMES = new Set(['answered', 'played', 'unanswered', 'busy', 'failed', 'suppressed']);
const RETRYABLE = new Set(['unanswered', 'busy']);
const LIVE_CAMPAIGN = new Set(['running', 'paused', 'scheduled']);

export async function publishCampaign(campaign) {
  try {
    await publish('campaign.updated', {
      orgId: campaign.orgId,
      campaign: serializeCampaign(campaign),
    });
  } catch (err) {
    console.error('[dialer] publish failed', err.message);
  }
}

/** Credits still held for a campaign (positive number). */
export async function remainingReservation(tx, campaignId) {
  const r = await tx.creditLedger.aggregate({
    where: { refId: campaignId, reason: { in: ['campaign_reserve', 'campaign_release'] } },
    _sum: { delta: true },
  });
  return -(r._sum.delta ?? 0);
}

/**
 * Record the final outcome of one call attempt. Idempotent: a second report
 * for the same attempt is ignored.
 * @param {string} attemptId
 * @param {{outcome:string, durationSec?:number, dtmf?:string|null, error?:string|null}} result
 */
export async function handleCallResult(attemptId, result, { now = new Date() } = {}) {
  const outcome = result?.outcome;
  if (!OUTCOMES.has(outcome)) throw new Error(`Unknown call outcome "${outcome}"`);

  const out = await prisma.$transaction(async (tx) => {
    const locked =
      await tx.$queryRaw`SELECT id FROM "CallAttempt" WHERE id = ${attemptId} FOR UPDATE`;
    if (!locked.length) return null;
    const att = await tx.callAttempt.findUnique({ where: { id: attemptId } });
    if (TERMINAL_CALL_STATUSES.has(att.status)) return null;

    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${att.campaignId} FOR UPDATE`;
    const camp = await tx.campaign.findUnique({ where: { id: att.campaignId } });

    const answered = outcome === 'answered' || outcome === 'played';
    let charge = 0;
    if (answered) {
      const remaining = await remainingReservation(tx, camp.id);
      charge = Math.min(camp.creditsPerCall, Math.max(0, remaining));
      if (charge > 0) {
        await tx.creditLedger.createMany({
          data: [
            { orgId: camp.orgId, delta: -charge, reason: 'call_charge', refId: att.id },
            {
              orgId: camp.orgId,
              delta: charge,
              reason: 'campaign_release',
              refId: camp.id,
              note: 'charged',
            },
          ],
        });
      }
    }

    const willRetry =
      RETRYABLE.has(outcome) && att.attemptNo < MAX_ATTEMPTS && LIVE_CAMPAIGN.has(camp.status);

    await tx.callAttempt.update({
      where: { id: att.id },
      data: {
        status: outcome,
        durationSec: Math.round(Number(result.durationSec) || 0),
        creditsCharged: charge,
        endedAt: now,
        dtmf: result.dtmf ?? att.dtmf,
        error: result.error ? String(result.error).slice(0, 500) : null,
      },
    });

    if (willRetry) {
      await tx.callAttempt.create({
        data: {
          campaignId: att.campaignId,
          contactId: att.contactId,
          orgId: att.orgId,
          phoneE164: att.phoneE164,
          contactName: att.contactName,
          attemptNo: att.attemptNo + 1,
          notBefore: new Date(now.getTime() + config.voice.retryDelaySec * 1000),
        },
      });
    }

    const data = { creditsUsed: { increment: charge } };
    // Press 9 (if not already recorded by the DTMF webhook).
    if (answered && camp.optOutEnabled && result.dtmf === '9' && att.dtmf !== '9') {
      await addSuppression(camp.orgId, att.phoneE164, 'press9', `campaign ${camp.id}`, tx);
      data.optOuts = { increment: 1 };
    }
    if (!willRetry) {
      data.processed = { increment: 1 };
      if (answered) data.answered = { increment: 1 };
      if (outcome === 'played') data.played = { increment: 1 };
      if (outcome === 'unanswered') data.unanswered = { increment: 1 };
      if (outcome === 'busy') data.busy = { increment: 1 };
      if (outcome === 'failed') data.failed = { increment: 1 };
      if (outcome === 'suppressed') data.skipped = { increment: 1 };
    }
    const campaign = await tx.campaign.update({ where: { id: camp.id }, data });
    return { campaign, charge, willRetry };
  });

  if (!out) return null;
  await publishCampaign(out.campaign);
  await finalizeIfDone(out.campaign.id);
  return out;
}

/**
 * Complete a campaign when nothing is left to dial, and release any unused
 * reservation once no call is still in flight. Safe to call repeatedly.
 */
export async function finalizeIfDone(campaignId, { now = new Date() } = {}) {
  const res = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
    const c = await tx.campaign.findUnique({ where: { id: campaignId } });
    if (!c) return null;
    const queued = await tx.callAttempt.count({ where: { campaignId, status: 'queued' } });
    const ringing = await tx.callAttempt.count({ where: { campaignId, status: 'ringing' } });

    let status = c.status;
    if ((status === 'running' || status === 'paused') && queued === 0 && ringing === 0) {
      status = 'completed';
    }
    let released = 0;
    if (['completed', 'cancelled', 'rejected'].includes(status) && ringing === 0) {
      const remaining = await remainingReservation(tx, campaignId);
      if (remaining > 0) {
        await tx.creditLedger.create({
          data: {
            orgId: c.orgId,
            delta: remaining,
            reason: 'campaign_release',
            refId: campaignId,
            note: 'unused',
          },
        });
        released = remaining;
      }
    }
    if (status === c.status && !released) return null;
    const campaign = await tx.campaign.update({
      where: { id: campaignId },
      data: { status, completedAt: status !== c.status || !c.completedAt ? now : undefined },
    });
    return { campaign, released };
  });
  if (res) await publishCampaign(res.campaign);
  return res;
}

/**
 * One scheduler tick: promote scheduled campaigns, time out stuck calls, then
 * (inside calling hours) dial queued attempts up to the per-org and global
 * concurrency limits.
 */
export async function runTick({ provider = getVoiceProvider(), now = new Date() } = {}) {
  const stats = { promoted: 0, dialed: 0, suppressed: 0, timedOut: 0, outsideHours: false };

  // 1. Scheduled campaigns whose time has come.
  const due = await prisma.campaign.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: now } },
    select: { id: true },
  });
  for (const { id } of due) {
    const { count } = await prisma.campaign.updateMany({
      where: { id, status: 'scheduled' },
      data: { status: 'running', startedAt: now },
    });
    if (count) {
      stats.promoted++;
      await publishCampaign(await prisma.campaign.findUnique({ where: { id } }));
    }
  }

  // 2. Calls the provider never reported back on.
  const stale = await prisma.callAttempt.findMany({
    where: {
      status: 'ringing',
      dialedAt: { lt: new Date(now.getTime() - config.voice.ringTimeoutSec * 1000) },
    },
    select: { id: true },
    take: 500,
  });
  for (const { id } of stale) {
    await handleCallResult(
      id,
      { outcome: 'failed', error: 'No result from voice provider (timeout)' },
      { now },
    );
    stats.timedOut++;
  }

  // 3. Calling hours: 08:00–19:00 Africa/Nairobi.
  if (!isWithinCallingHours(now, config.callingHours)) {
    stats.outsideHours = true;
    stats.nextWindow = nextCallingWindowStart(now, config.callingHours);
    return stats;
  }

  const campaigns = await prisma.campaign.findMany({
    where: { status: 'running', org: { status: 'active' } },
    include: { recording: true, org: { select: { name: true } } },
    orderBy: { startedAt: 'asc' },
  });
  if (!campaigns.length) return stats;

  let globalInflight = await prisma.callAttempt.count({ where: { status: 'ringing' } });
  const orgRows = await prisma.callAttempt.groupBy({
    by: ['orgId'],
    where: { status: 'ringing' },
    _count: { _all: true },
  });
  const orgInflight = new Map(orgRows.map((r) => [r.orgId, r._count._all]));

  for (const c of campaigns) {
    const globalSlots = config.voice.globalConcurrency - globalInflight;
    if (globalSlots <= 0) break;
    const orgUsed = orgInflight.get(c.orgId) ?? 0;
    const slots = Math.min(globalSlots, c.concurrency - orgUsed);
    if (slots <= 0) continue;

    // Atomically claim attempts (safe with several workers).
    // Prisma stores DateTime as UTC `timestamp without time zone`, so the
    // parameter is converted to UTC explicitly (independent of the DB timezone).
    const nowUtc = Prisma.sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    const claimed = await prisma.$queryRaw`
      UPDATE "CallAttempt" SET status = 'ringing', "dialedAt" = ${nowUtc}
      WHERE id IN (
        SELECT id FROM "CallAttempt"
        WHERE "campaignId" = ${c.id} AND status = 'queued' AND "notBefore" <= ${nowUtc}
        ORDER BY "attemptNo" ASC, "createdAt" ASC
        LIMIT ${slots}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "phoneE164"`;

    if (!claimed.length) {
      const pending = await prisma.callAttempt.count({
        where: { campaignId: c.id, status: { in: ['queued', 'ringing'] } },
      });
      if (pending === 0) await finalizeIfDone(c.id, { now });
      continue;
    }

    orgInflight.set(c.orgId, orgUsed + claimed.length);
    globalInflight += claimed.length;

    // Suppression is checked again right before dialing.
    const blocked = await suppressedSet(
      c.orgId,
      claimed.map((a) => a.phoneE164),
    );
    await Promise.all(
      claimed.map(async (a) => {
        if (blocked.has(a.phoneE164)) {
          await handleCallResult(a.id, { outcome: 'suppressed' }, { now });
          stats.suppressed++;
          return;
        }
        try {
          const { providerCallId } = await provider.placeCall({
            attemptId: a.id,
            to: a.phoneE164,
            campaign: c,
            report: (id, r) => handleCallResult(id, r),
          });
          await prisma.callAttempt.update({ where: { id: a.id }, data: { providerCallId } });
          stats.dialed++;
        } catch (err) {
          await handleCallResult(a.id, { outcome: 'failed', error: err.message }, { now });
        }
      }),
    );
  }
  return stats;
}
