import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

/** Sum of ledger rows = available credits (reservations are negative rows). */
export async function availableCredits(orgId, tx = prisma) {
  const r = await tx.creditLedger.aggregate({ where: { orgId }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
}

/**
 * Balance breakdown for an organisation.
 *  - credits:   purchased/bonus/refunded credits minus credits charged for calls
 *  - reserved:  credits held for running campaigns
 *  - available: credits - reserved (= sum of every ledger row)
 */
export async function creditBalance(orgId, tx = prisma) {
  const rows = await tx.creditLedger.groupBy({
    by: ['reason'],
    where: { orgId },
    _sum: { delta: true },
  });
  const by = Object.fromEntries(rows.map((r) => [r.reason, r._sum.delta ?? 0]));
  const reserved = -((by.campaign_reserve ?? 0) + (by.campaign_release ?? 0)) || 0;
  const credits = (by.purchase ?? 0) + (by.bonus ?? 0) + (by.refund ?? 0) + (by.call_charge ?? 0);
  return { credits, reserved, available: credits - reserved };
}

/** Lock an organisation row so credit checks + writes are serialised. */
export async function lockOrg(tx, orgId) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;
}

export async function activeSubscription(orgId, tx = prisma, now = new Date()) {
  return tx.subscription.findFirst({
    where: { orgId, startsAt: { lte: now }, expiresAt: { gt: now } },
    orderBy: { expiresAt: 'desc' },
    include: { plan: true },
  });
}
