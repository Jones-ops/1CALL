import { APPROVAL_CATEGORIES, creditsPerCall } from '@1call/shared';
import { prisma, availableCredits, activeSubscription, creditBalance, lockOrg } from '../db.js';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { suppressedSet } from '../engine/suppression.js';
import { finalizeIfDone, publishCampaign } from '../engine/dialer.js';

const CHUNK = 1000;

async function recipientsFor(orgId, groupId) {
  const group = await prisma.contactGroup.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw notFound('Contact group not found');
  const contacts = await prisma.contact.findMany({
    where: { orgId, groupId },
    select: { id: true, phoneE164: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const blocked = await suppressedSet(
    orgId,
    contacts.map((c) => c.phoneE164),
  );
  const callable = contacts.filter((c) => !blocked.has(c.phoneE164));
  return { group, total: contacts.length, optedOut: contacts.length - callable.length, callable };
}

async function findRecording(orgId, recordingId) {
  if (!recordingId) return null;
  const rec = await prisma.recording.findFirst({
    where: { id: recordingId, orgId, deletedAt: null },
  });
  if (!rec) throw notFound('Recording not found');
  return rec;
}

export async function estimateCampaign(orgId, { groupId, recordingId }) {
  const [{ total, optedOut, callable }, rec, balance, sub] = await Promise.all([
    recipientsFor(orgId, groupId),
    findRecording(orgId, recordingId),
    creditBalance(orgId),
    activeSubscription(orgId),
  ]);
  const cpc = rec ? creditsPerCall(rec.durationSec) : 1;
  const recipients = callable.length;
  const estimatedCredits = recipients * cpc;
  return {
    total,
    optedOut,
    recipients,
    creditsPerCall: cpc,
    estimatedCredits,
    available: balance.available,
    sufficient: balance.available >= estimatedCredits,
    subscriptionActive: !!sub,
    planName: sub?.plan.name ?? null,
    maxRecipients: sub?.plan.maxRecipients ?? 0,
    overPlanLimit: !!sub && recipients > sub.plan.maxRecipients,
  };
}

/**
 * Launch a campaign: validate every business rule, reserve credits and queue
 * one call attempt per recipient — all in a single transaction.
 */
export async function createCampaign(user, input, ip, now = new Date()) {
  const org = await prisma.organization.findUnique({ where: { id: user.orgId } });
  if (!org) throw notFound('Organisation not found');
  if (org.status !== 'active') throw forbidden('Your account is suspended.', 'ORG_SUSPENDED');

  const requiresApproval = APPROVAL_CATEGORIES.includes(input.category);
  if (requiresApproval && !org.verified) {
    throw forbidden(
      'Promotional and political campaigns need a verified account. Contact support to verify your organisation.',
      'ORG_NOT_VERIFIED',
    );
  }
  if (!input.declarations?.consent || !input.declarations?.lawful) {
    throw badRequest('Please confirm both declarations before launching.', 'DECLARATIONS_REQUIRED');
  }

  const rec = await findRecording(org.id, input.recordingId);
  if (!rec.identifiesCaller) {
    throw badRequest(
      'This recording has not been confirmed to say who is calling.',
      'RECORDING_NOT_CONFIRMED',
    );
  }

  const sub = await activeSubscription(org.id, prisma, now);
  if (!sub)
    throw new HttpError(402, 'You need an active plan to launch a campaign.', 'NO_SUBSCRIPTION');

  let scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() < now.getTime() - 60_000) {
    throw badRequest('The scheduled time is in the past.', 'SCHEDULE_IN_PAST');
  }
  if (scheduledAt && scheduledAt <= now) scheduledAt = null;

  const { callable } = await recipientsFor(org.id, input.groupId);
  if (!callable.length) throw badRequest('There is nobody to call in this group.', 'NO_RECIPIENTS');
  if (callable.length > sub.plan.maxRecipients) {
    throw badRequest(
      `Your ${sub.plan.name} plan allows up to ${sub.plan.maxRecipients.toLocaleString()} recipients per campaign.`,
      'PLAN_LIMIT',
    );
  }

  const cpc = creditsPerCall(rec.durationSec);
  const required = callable.length * cpc;
  const status = requiresApproval ? 'pending_approval' : scheduledAt ? 'scheduled' : 'running';

  const campaign = await prisma.$transaction(
    async (tx) => {
      await lockOrg(tx, org.id);
      const available = await availableCredits(org.id, tx);
      if (available < required) {
        throw new HttpError(
          402,
          `Not enough credits: this campaign needs up to ${required.toLocaleString()} and you have ${available.toLocaleString()} available.`,
          'INSUFFICIENT_CREDITS',
          { required, available },
        );
      }
      const c = await tx.campaign.create({
        data: {
          orgId: org.id,
          createdById: user.id,
          name: input.name.trim(),
          groupId: input.groupId,
          recordingId: rec.id,
          category: input.category,
          scheduledAt,
          optOutEnabled: input.optOutEnabled,
          status,
          concurrency: sub.plan.concurrency,
          creditsPerCall: cpc,
          recipients: callable.length,
          creditsReserved: required,
          declarationsAccepted: true,
          declarationsAt: now,
          declarationsIp: ip,
          requiresApproval,
          startedAt: status === 'running' ? now : null,
        },
      });
      await tx.creditLedger.create({
        data: {
          orgId: org.id,
          delta: -required,
          reason: 'campaign_reserve',
          refId: c.id,
          actorId: user.id,
        },
      });
      for (let i = 0; i < callable.length; i += CHUNK) {
        await tx.callAttempt.createMany({
          data: callable.slice(i, i + CHUNK).map((ct) => ({
            campaignId: c.id,
            contactId: ct.id,
            orgId: org.id,
            phoneE164: ct.phoneE164,
            contactName: ct.name,
            notBefore: scheduledAt ?? now,
          })),
        });
      }
      return c;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  await audit({ actorId: user.id, orgId: org.id, ip }, 'campaign.launch', {
    targetType: 'campaign',
    targetId: campaign.id,
    details: {
      name: campaign.name,
      category: campaign.category,
      recipients: callable.length,
      reserved: required,
      status,
    },
  });
  await publishCampaign(campaign);
  return campaign;
}

async function ownCampaign(orgId, id) {
  const c = await prisma.campaign.findFirst({ where: { id, orgId } });
  if (!c) throw notFound('Campaign not found');
  return c;
}

export async function pauseCampaign(user, id, ip) {
  await ownCampaign(user.orgId, id);
  const { count } = await prisma.campaign.updateMany({
    where: { id, orgId: user.orgId, status: { in: ['running', 'scheduled'] } },
    data: { status: 'paused' },
  });
  if (!count) throw conflict('Only running or scheduled campaigns can be paused.');
  await audit({ actorId: user.id, orgId: user.orgId, ip }, 'campaign.pause', {
    targetType: 'campaign',
    targetId: id,
  });
  const c = await prisma.campaign.findUnique({ where: { id } });
  await publishCampaign(c);
  return c;
}

export async function resumeCampaign(user, id, ip, now = new Date()) {
  const c0 = await ownCampaign(user.orgId, id);
  const org = await prisma.organization.findUnique({ where: { id: user.orgId } });
  if (org.status !== 'active') throw forbidden('Your account is suspended.', 'ORG_SUSPENDED');
  const next = c0.scheduledAt && c0.scheduledAt > now ? 'scheduled' : 'running';
  const { count } = await prisma.campaign.updateMany({
    where: { id, orgId: user.orgId, status: 'paused' },
    data: { status: next, startedAt: next === 'running' ? (c0.startedAt ?? now) : undefined },
  });
  if (!count) throw conflict('Only paused campaigns can be resumed.');
  await audit({ actorId: user.id, orgId: user.orgId, ip }, 'campaign.resume', {
    targetType: 'campaign',
    targetId: id,
  });
  const c = await prisma.campaign.findUnique({ where: { id } });
  await publishCampaign(c);
  return c;
}

/** Cancel (by owner) or reject (by admin): stop queued calls and release credits. */
export async function stopCampaign(id, { status, reason = null, now = new Date() }) {
  const ok = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${id} FOR UPDATE`;
    const from =
      status === 'rejected'
        ? ['pending_approval']
        : ['pending_approval', 'scheduled', 'running', 'paused'];
    const { count } = await tx.campaign.updateMany({
      where: { id, status: { in: from } },
      data: { status, completedAt: now, rejectedReason: reason },
    });
    if (!count) return false;
    await tx.callAttempt.updateMany({
      where: { campaignId: id, status: 'queued' },
      data: { status: 'cancelled', endedAt: now },
    });
    return true;
  });
  if (!ok) return null;
  const fin = await finalizeIfDone(id, { now });
  const c = fin?.campaign ?? (await prisma.campaign.findUnique({ where: { id } }));
  await publishCampaign(c);
  return c;
}

export async function cancelCampaign(user, id, ip) {
  await ownCampaign(user.orgId, id);
  const c = await stopCampaign(id, { status: 'cancelled' });
  if (!c) throw conflict('This campaign has already finished.');
  await audit({ actorId: user.id, orgId: user.orgId, ip }, 'campaign.cancel', {
    targetType: 'campaign',
    targetId: id,
  });
  return c;
}

export async function decideApproval(admin, id, { decision, reason }, ip, now = new Date()) {
  const c0 = await prisma.campaign.findUnique({ where: { id }, include: { org: true } });
  if (!c0 || c0.status !== 'pending_approval') throw notFound('No pending campaign with this id');
  let c;
  if (decision === 'approve') {
    if (!c0.org.verified) throw forbidden('The organisation is not verified.', 'ORG_NOT_VERIFIED');
    const next = c0.scheduledAt && c0.scheduledAt > now ? 'scheduled' : 'running';
    const { count } = await prisma.campaign.updateMany({
      where: { id, status: 'pending_approval' },
      data: {
        status: next,
        approvedById: admin.id,
        approvedAt: now,
        startedAt: next === 'running' ? now : null,
      },
    });
    if (!count) throw conflict('Campaign is no longer pending.');
    // Calls queued before approval become due now (or at the scheduled time).
    await prisma.callAttempt.updateMany({
      where: { campaignId: id, status: 'queued', notBefore: { lt: now } },
      data: { notBefore: next === 'running' ? now : c0.scheduledAt },
    });
    c = await prisma.campaign.findUnique({ where: { id } });
    await publishCampaign(c);
  } else {
    c = await stopCampaign(id, { status: 'rejected', reason: reason || 'Rejected by admin', now });
    if (!c) throw conflict('Campaign is no longer pending.');
  }
  await audit(
    { actorId: admin.id, orgId: c0.orgId, ip },
    `campaign.${decision === 'approve' ? 'approve' : 'reject'}`,
    {
      targetType: 'campaign',
      targetId: id,
      details: { reason: reason || null },
    },
  );
  return c;
}
