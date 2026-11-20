import { prisma } from '../db.js';

/**
 * Write an audit log entry. Never throws (auditing must not break requests),
 * but failures are logged.
 */
export async function audit(
  { actorId = null, orgId = null, ip = null },
  action,
  { targetType = null, targetId = null, details = null } = {},
  tx = prisma,
) {
  try {
    await tx.auditLog.create({
      data: { actorId, orgId, action, targetType, targetId, details: details ?? undefined, ip },
    });
  } catch (err) {
    console.error('[audit] failed to write', action, err.message);
  }
}

/** Build the audit context from an authenticated request. */
export const ctx = (req) => ({
  actorId: req.user?.id ?? null,
  orgId: req.user?.orgId ?? null,
  ip: req.ip ?? null,
});
