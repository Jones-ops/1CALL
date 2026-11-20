import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { unauthorized } from '../lib/errors.js';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, org: user.orgId, role: user.role }, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTtl,
    issuer: '1call',
    audience: '1call-app',
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.auth.jwtSecret, { issuer: '1call', audience: '1call-app' });
  } catch {
    throw unauthorized('Session expired', 'TOKEN_INVALID');
  }
}

export async function issueRefreshToken(userId, familyId = crypto.randomUUID(), tx = prisma) {
  const raw = randomToken();
  await tx.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      familyId,
      expiresAt: new Date(Date.now() + config.auth.refreshTtlDays * 86400_000),
    },
  });
  return raw;
}

/**
 * Rotate a refresh token: the presented token is revoked and a new one in the
 * same family is issued. Presenting an already-revoked token is treated as
 * theft and revokes the whole family.
 */
export async function rotateRefreshToken(raw) {
  const rec = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(String(raw || '')) },
    include: { user: { include: { org: true } } },
  });
  if (!rec) throw unauthorized('Session expired', 'REFRESH_INVALID');
  if (rec.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: rec.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Session expired', 'REFRESH_REUSED');
  }
  if (rec.expiresAt < new Date()) throw unauthorized('Session expired', 'REFRESH_EXPIRED');

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: rec.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw unauthorized('Session expired', 'REFRESH_REUSED');
    const refreshToken = await issueRefreshToken(rec.userId, rec.familyId, tx);
    return { user: rec.user, refreshToken };
  });
}

export async function revokeRefreshToken(raw) {
  const rec = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(String(raw || '')) },
  });
  if (!rec) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: rec.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** One-time tokens for email verification and password reset. */
export async function createAuthToken(userId, type, ttlMinutes) {
  const raw = randomToken(32);
  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    },
  });
  return raw;
}

export async function consumeAuthToken(raw, type) {
  const rec = await prisma.authToken.findUnique({
    where: { tokenHash: sha256(String(raw || '')) },
  });
  if (!rec || rec.type !== type || rec.usedAt || rec.expiresAt < new Date()) return null;
  const { count } = await prisma.authToken.updateMany({
    where: { id: rec.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count ? rec : null;
}
