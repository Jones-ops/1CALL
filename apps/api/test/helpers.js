import argon2 from 'argon2';
import supertest from 'supertest';
import { nextCallingWindowStart } from '@1call/shared';
import { prisma } from '../src/db.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/services/tokens.js';

export const api = () => supertest(createApp());

export async function resetDb() {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let pwHash;
let seq = 0;

/** A customer org with a verified owner, an active plan and credits. */
export async function makeCustomer({
  credits = 1000,
  verified = false,
  maxRecipients = 500,
  concurrency = 5,
  subscription = true,
  role = 'owner',
} = {}) {
  seq++;
  pwHash ??= await argon2.hash('Password123!', { type: argon2.argon2id });
  const plan = await prisma.plan.create({
    data: {
      name: `Plan ${seq}`,
      priceKes: 1000,
      credits: 500,
      days: 30,
      maxRecipients,
      concurrency,
    },
  });
  const org = await prisma.organization.create({ data: { name: `Org ${seq}`, verified } });
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      name: `User ${seq}`,
      email: `user${seq}@test.example`,
      passwordHash: pwHash,
      role,
      emailVerifiedAt: new Date(),
    },
  });
  if (subscription) {
    await prisma.subscription.create({
      data: {
        orgId: org.id,
        planId: plan.id,
        startsAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      },
    });
  }
  if (credits)
    await prisma.creditLedger.create({
      data: { orgId: org.id, delta: credits, reason: 'purchase' },
    });
  return {
    org,
    user,
    plan,
    token: signAccessToken(user),
    auth: { Authorization: `Bearer ${signAccessToken(user)}` },
  };
}

export async function makeAdmin() {
  const c = await makeCustomer({ role: 'admin', credits: 0, subscription: false });
  return c;
}

export async function makeRecording(orgId, durationSec = 14) {
  return prisma.recording.create({
    data: {
      orgId,
      name: 'Test message',
      storageKey: `test/${orgId}.wav`,
      durationSec,
      identifiesCaller: true,
    },
  });
}

export async function makeGroup(orgId, phones, name = 'Test group') {
  const group = await prisma.contactGroup.create({ data: { orgId, name } });
  await prisma.contact.createMany({
    data: phones.map((p, i) => ({
      orgId,
      groupId: group.id,
      name: `Contact ${i}`,
      phoneE164: p,
      consentSource: 'web_form',
      consentAt: new Date(),
    })),
  });
  return group;
}

export const phones = (n, start = 0) =>
  Array.from({ length: n }, (_, i) => `+2547${String(10000000 + start + i).slice(0, 8)}`);

/** A provider that records calls; outcomes are reported manually by the test. */
export function fakeProvider() {
  const calls = [];
  return {
    calls,
    name: 'fake',
    async placeCall({ attemptId, to }) {
      calls.push({ attemptId, to });
      return { providerCallId: `fake_${attemptId}` };
    },
    buildAnswerResponse: () => ({ contentType: 'application/xml', body: '<Response/>' }),
    buildDtmfResponse: () => ({ contentType: 'application/xml', body: '<Response/>' }),
    parseEvent: (b) => b,
  };
}

/** A moment inside calling hours, slightly in the future. */
export const insideHours = (offsetSec = 60) =>
  nextCallingWindowStart(new Date(Date.now() + offsetSec * 1000));

/** 21:00 East Africa Time, two days from now. */
export function outsideHours() {
  const d = new Date(Date.now() + 2 * 86400_000);
  d.setUTCHours(18, 0, 0, 0);
  return d;
}

export const launchBody = (groupId, recordingId, extra = {}) => ({
  name: 'Test campaign',
  groupId,
  recordingId,
  category: 'informational',
  optOutEnabled: true,
  declarations: { consent: true, lawful: true },
  ...extra,
});

export async function balance(orgId) {
  const { creditBalance } = await import('../src/db.js');
  return creditBalance(orgId);
}

export { prisma };
