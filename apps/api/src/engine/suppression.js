import { prisma } from '../db.js';

const CHUNK = 5000;

/** Set of numbers (from `phones`) on the org's OR the global suppression list. */
export async function suppressedSet(orgId, phones, tx = prisma) {
  const out = new Set();
  const unique = [...new Set(phones)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const rows = await tx.suppression.findMany({
      where: { phoneE164: { in: unique.slice(i, i + CHUNK) }, OR: [{ orgId }, { orgId: null }] },
      select: { phoneE164: true },
    });
    rows.forEach((r) => out.add(r.phoneE164));
  }
  return out;
}

export async function isSuppressed(orgId, phone, tx = prisma) {
  const s = await tx.suppression.findFirst({
    where: { phoneE164: phone, OR: [{ orgId }, { orgId: null }] },
    select: { id: true },
  });
  return !!s;
}

/** Add a number to an org's suppression list (or the global list when orgId is null). */
export async function addSuppression(orgId, phoneE164, source, note = null, tx = prisma) {
  if (orgId) {
    return tx.suppression.upsert({
      where: { orgId_phoneE164: { orgId, phoneE164 } },
      update: {},
      create: { orgId, phoneE164, source, note },
    });
  }
  const existing = await tx.suppression.findFirst({ where: { orgId: null, phoneE164 } });
  return existing ?? tx.suppression.create({ data: { orgId: null, phoneE164, source, note } });
}
