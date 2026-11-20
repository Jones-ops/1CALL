import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { validate } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { HttpError, badRequest, conflict, unauthorized } from '../lib/errors.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  createAuthToken,
  consumeAuthToken,
} from '../services/tokens.js';
import { sendMail } from '../services/mailer.js';
import { normalizePhone } from '@1call/shared';

const router = Router();
router.use(authLimiter);

const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (pw) => argon2.hash(pw, ARGON);
let dummyHash = null;

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);

export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  emailVerified: !!u.emailVerifiedAt,
  org: u.org
    ? { id: u.org.id, name: u.org.name, verified: u.org.verified, status: u.org.status }
    : undefined,
});

async function sendVerification(user) {
  const token = await createAuthToken(user.id, 'verify_email', 60 * 24);
  const url = `${config.publicUrl}/api/v1/auth/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your 1CALL account',
    text: `Hello ${user.name},\n\nConfirm your email address to start using 1CALL:\n${url}\n\nThis link expires in 24 hours.`,
  });
  return config.exposeDevTokens ? { devVerifyUrl: url, devVerifyToken: token } : {};
}

router.post(
  '/register',
  validate(
    z.object({
      orgName: z.string().trim().min(2).max(120),
      name: z.string().trim().min(2).max(120),
      email,
      phone: z.string().trim().min(9).max(20),
      password,
    }),
  ),
  async (req, res) => {
    const b = req.valid.body;
    const phone = normalizePhone(b.phone);
    if (!phone) throw badRequest('Enter a valid phone number.', 'INVALID_PHONE');
    if (await prisma.user.findUnique({ where: { email: b.email } })) {
      throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
    }
    const passwordHash = await hashPassword(b.password);
    const user = await prisma.user.create({
      data: {
        name: b.name,
        email: b.email,
        phone,
        passwordHash,
        role: 'owner',
        org: { create: { name: b.orgName } },
      },
    });
    const dev = await sendVerification(user);
    await audit({ actorId: user.id, orgId: user.orgId, ip: req.ip }, 'auth.register', {
      targetType: 'user',
      targetId: user.id,
    });
    res
      .status(201)
      .json({ ok: true, message: 'Check your email for a verification link.', ...dev });
  },
);

router.post('/resend-verification', validate(z.object({ email })), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.valid.body.email } });
  let dev = {};
  if (user && !user.emailVerifiedAt) dev = await sendVerification(user);
  res.json({ ok: true, message: 'If the account exists, a new link has been sent.', ...dev });
});

router.post(
  '/login',
  validate(z.object({ email, password: z.string().min(1).max(200) })),
  async (req, res) => {
    const { email: em, password: pw } = req.valid.body;
    const user = await prisma.user.findUnique({ where: { email: em }, include: { org: true } });
    if (!user) {
      dummyHash ??= await hashPassword('dummy-password-for-timing');
      await argon2.verify(dummyHash, pw).catch(() => false);
      throw unauthorized('Email or password is incorrect.', 'BAD_CREDENTIALS');
    }
    const since = new Date(Math.max(Date.now() - 15 * 60_000, user.lastLoginAt?.getTime() ?? 0));
    const recentFailures = await prisma.auditLog.count({
      where: { actorId: user.id, action: 'auth.login_failed', createdAt: { gt: since } },
    });
    if (recentFailures >= 10) {
      throw new HttpError(
        429,
        'Too many failed sign-in attempts. Try again in 15 minutes or reset your password.',
        'ACCOUNT_LOCKED',
      );
    }
    const ok = await argon2.verify(user.passwordHash, pw).catch(() => false);
    if (!ok) {
      await audit({ actorId: user.id, orgId: user.orgId, ip: req.ip }, 'auth.login_failed');
      throw unauthorized('Email or password is incorrect.', 'BAD_CREDENTIALS');
    }
    if (!user.emailVerifiedAt && config.auth.requireEmailVerification) {
      throw new HttpError(403, 'Please verify your email address first.', 'EMAIL_NOT_VERIFIED');
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const refreshToken = await issueRefreshToken(user.id);
    await audit({ actorId: user.id, orgId: user.orgId, ip: req.ip }, 'auth.login');
    res.json({ accessToken: signAccessToken(user), refreshToken, user: publicUser(user) });
  },
);

router.post(
  '/refresh',
  validate(z.object({ refreshToken: z.string().min(10).max(200) })),
  async (req, res) => {
    const { user, refreshToken } = await rotateRefreshToken(req.valid.body.refreshToken);
    res.json({ accessToken: signAccessToken(user), refreshToken, user: publicUser(user) });
  },
);

router.post(
  '/logout',
  validate(z.object({ refreshToken: z.string().max(200).optional() })),
  async (req, res) => {
    if (req.valid.body.refreshToken) await revokeRefreshToken(req.valid.body.refreshToken);
    res.json({ ok: true });
  },
);

async function verifyEmailToken(token) {
  const rec = await consumeAuthToken(token, 'verify_email');
  if (!rec) return false;
  await prisma.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: rec.userId }, 'auth.verify_email');
  return true;
}

router.post(
  '/verify-email',
  validate(z.object({ token: z.string().min(10).max(200) })),
  async (req, res) => {
    if (!(await verifyEmailToken(req.valid.body.token))) {
      throw badRequest('This verification link is invalid or has expired.', 'TOKEN_INVALID');
    }
    res.json({ ok: true });
  },
);

// Link clicked from the email.
router.get('/verify-email', async (req, res) => {
  const ok = await verifyEmailToken(String(req.query.token || ''));
  res
    .status(ok ? 200 : 400)
    .type('html')
    .send(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>1CALL</title>` +
        `<body style="font-family:system-ui;background:#f4f6fb;color:#0f1b3d;text-align:center;padding:48px 16px">` +
        `<h1 style="color:#0b3a8f">1CALL</h1><p>${ok ? 'Your email is verified. You can now sign in from the 1CALL app.' : 'This link is invalid or has expired. Request a new one from the app.'}</p></body>`,
    );
});

router.post('/forgot-password', validate(z.object({ email })), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.valid.body.email } });
  let dev = {};
  if (user) {
    const token = await createAuthToken(user.id, 'reset_password', 60);
    await sendMail({
      to: user.email,
      subject: 'Reset your 1CALL password',
      text: `Your 1CALL password reset code is:\n\n${token}\n\nPaste it into the app. It expires in 1 hour. If you did not ask for this, ignore this email.`,
    });
    await audit({ actorId: user.id, orgId: user.orgId, ip: req.ip }, 'auth.forgot_password');
    if (config.exposeDevTokens) dev = { devResetToken: token };
  }
  res.json({
    ok: true,
    message: 'If an account exists for this email, a reset code has been sent.',
    ...dev,
  });
});

router.post(
  '/reset-password',
  validate(z.object({ token: z.string().min(10).max(200), password })),
  async (req, res) => {
    const rec = await consumeAuthToken(req.valid.body.token, 'reset_password');
    if (!rec) throw badRequest('This reset code is invalid or has expired.', 'TOKEN_INVALID');
    await prisma.user.update({
      where: { id: rec.userId },
      data: {
        passwordHash: await hashPassword(req.valid.body.password),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: rec.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit({ actorId: rec.userId, ip: req.ip }, 'auth.reset_password');
    res.json({ ok: true });
  },
);

export default router;
