import {
  api,
  resetDb,
  makeCustomer,
  makeAdmin,
  makeRecording,
  makeGroup,
  phones,
  fakeProvider,
  insideHours,
  outsideHours,
  launchBody,
  balance,
  prisma,
} from './helpers.js';
import { nextCallingWindowStart } from '@1call/shared';
import { runTick, handleCallResult } from '../src/engine/dialer.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function setup(opts = {}) {
  const c = await makeCustomer(opts);
  const rec = await makeRecording(c.org.id, opts.duration ?? 14);
  const group = await makeGroup(c.org.id, phones(opts.n ?? 10));
  return { ...c, rec, group };
}

const launch = (s, extra) =>
  api()
    .post('/api/v1/campaigns')
    .set(s.auth)
    .send(launchBody(s.group.id, s.rec.id, extra));

async function attemptsOf(campaignId) {
  return prisma.callAttempt.findMany({
    where: { campaignId },
    orderBy: [{ attemptNo: 'asc' }, { createdAt: 'asc' }],
  });
}

describe('estimate & launch', () => {
  test('estimate excludes opted-out numbers (org and global lists)', async () => {
    const s = await setup({ n: 10 });
    const p = phones(10);
    await prisma.suppression.create({
      data: { orgId: s.org.id, phoneE164: p[0], source: 'press9' },
    });
    await prisma.suppression.create({ data: { orgId: null, phoneE164: p[1], source: 'admin' } });
    const r = await api()
      .post('/api/v1/campaigns/estimate')
      .set(s.auth)
      .send({ groupId: s.group.id, recordingId: s.rec.id })
      .expect(200);
    expect(r.body).toMatchObject({
      total: 10,
      optedOut: 2,
      recipients: 8,
      creditsPerCall: 1,
      estimatedCredits: 8,
      available: 1000,
      sufficient: true,
    });
  });

  test('launch reserves recipients × credits-per-call and queues attempts', async () => {
    const s = await setup({ n: 10, duration: 45 }); // 45 s = 2 credits per call
    const r = await launch(s).expect(201);
    expect(r.body.campaign).toMatchObject({
      status: 'running',
      recipients: 10,
      creditsPerCall: 2,
      creditsReserved: 20,
    });
    expect(await balance(s.org.id)).toEqual({ credits: 1000, reserved: 20, available: 980 });
    expect(
      await prisma.callAttempt.count({
        where: { campaignId: r.body.campaign.id, status: 'queued' },
      }),
    ).toBe(10);
    expect(await prisma.auditLog.count({ where: { action: 'campaign.launch' } })).toBe(1);
  });

  test('rejects insufficient credits, plan limit, missing declarations, no subscription, suspension', async () => {
    const s = await setup({ n: 10, credits: 5 });
    expect((await launch(s).expect(402)).body.error.code).toBe('INSUFFICIENT_CREDITS');
    expect(await balance(s.org.id)).toEqual({ credits: 5, reserved: 0, available: 5 });

    const s2 = await setup({ n: 10, maxRecipients: 5 });
    expect((await launch(s2).expect(400)).body.error.code).toBe('PLAN_LIMIT');

    const s3 = await setup({ n: 3 });
    await launch(s3, { declarations: { consent: true, lawful: false } }).expect(400);

    const s4 = await setup({ n: 3, subscription: false });
    expect((await launch(s4).expect(402)).body.error.code).toBe('NO_SUBSCRIPTION');

    const s5 = await setup({ n: 3 });
    await prisma.organization.update({ where: { id: s5.org.id }, data: { status: 'suspended' } });
    expect((await launch(s5).expect(403)).body.error.code).toBe('ORG_SUSPENDED');
  });

  test('concurrent launches can never overspend credits', async () => {
    const s = await setup({ n: 10, credits: 15 });
    const results = await Promise.all([launch(s), launch(s), launch(s)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const b = await balance(s.org.id);
    expect(b.available).toBe(5);
    expect(b.available).toBeGreaterThanOrEqual(0);
  });
});

describe('dialing', () => {
  test('answered calls convert reservation to charges; completion releases the rest', async () => {
    const s = await setup({ n: 4 });
    const { body } = await launch(s).expect(201);
    const provider = fakeProvider();
    const stats = await runTick({ provider, now: insideHours() });
    expect(stats.dialed).toBe(4);
    const atts = await attemptsOf(body.campaign.id);
    expect(atts.every((a) => a.status === 'ringing')).toBe(true);

    await handleCallResult(atts[0].id, { outcome: 'played', durationSec: 18 });
    await handleCallResult(atts[0].id, { outcome: 'played', durationSec: 18 }); // duplicate ignored
    await handleCallResult(atts[1].id, { outcome: 'answered', durationSec: 3 });
    await handleCallResult(atts[2].id, { outcome: 'failed' });
    expect(await balance(s.org.id)).toEqual({ credits: 998, reserved: 2, available: 996 });

    await handleCallResult(atts[3].id, { outcome: 'failed' });
    const c = await prisma.campaign.findUnique({ where: { id: body.campaign.id } });
    expect(c).toMatchObject({
      status: 'completed',
      processed: 4,
      answered: 2,
      played: 1,
      failed: 2,
      creditsUsed: 2,
    });
    expect(await balance(s.org.id)).toEqual({ credits: 998, reserved: 0, available: 998 });
  });

  test('respects per-org concurrency', async () => {
    const s = await setup({ n: 12, concurrency: 5 });
    await launch(s).expect(201);
    const provider = fakeProvider();
    await runTick({ provider, now: insideHours() });
    expect(provider.calls).toHaveLength(5);
    await runTick({ provider, now: insideHours() });
    expect(provider.calls).toHaveLength(5); // still 5 in flight
  });

  test('numbers suppressed after launch are skipped just before dialing', async () => {
    const s = await setup({ n: 3 });
    const { body } = await launch(s).expect(201);
    await prisma.suppression.create({
      data: { orgId: s.org.id, phoneE164: phones(3)[1], source: 'manual' },
    });
    const provider = fakeProvider();
    const stats = await runTick({ provider, now: insideHours() });
    expect(stats.suppressed).toBe(1);
    expect(provider.calls.map((x) => x.to)).not.toContain(phones(3)[1]);
    const c = await prisma.campaign.findUnique({ where: { id: body.campaign.id } });
    expect(c.skipped).toBe(1);
  });

  test('press 9 adds the number to the suppression list', async () => {
    const s = await setup({ n: 1 });
    await launch(s).expect(201);
    const provider = fakeProvider();
    await runTick({ provider, now: insideHours() });
    await handleCallResult(provider.calls[0].attemptId, {
      outcome: 'played',
      durationSec: 20,
      dtmf: '9',
    });
    expect(
      await prisma.suppression.findFirst({
        where: { orgId: s.org.id, phoneE164: phones(1)[0], source: 'press9' },
      }),
    ).toBeTruthy();
  });

  test('unanswered/busy calls are retried once after ~30 minutes (max 2 attempts)', async () => {
    const s = await setup({ n: 1 });
    const { body } = await launch(s).expect(201);
    const provider = fakeProvider();
    const t0 = insideHours();
    await runTick({ provider, now: t0 });
    await handleCallResult(provider.calls[0].attemptId, { outcome: 'unanswered' }, { now: t0 });

    let atts = await attemptsOf(body.campaign.id);
    expect(atts).toHaveLength(2);
    expect(atts[1]).toMatchObject({ attemptNo: 2, status: 'queued' });
    expect((atts[1].notBefore - t0) / 1000).toBe(1800);

    await runTick({ provider, now: new Date(t0.getTime() + 60_000) });
    expect(provider.calls).toHaveLength(1); // not yet due

    const t1 = nextCallingWindowStart(new Date(t0.getTime() + 1900_000));
    await runTick({ provider, now: t1 });
    expect(provider.calls).toHaveLength(2);
    await handleCallResult(provider.calls[1].attemptId, { outcome: 'busy' }, { now: t1 });
    atts = await attemptsOf(body.campaign.id);
    expect(atts).toHaveLength(2); // no third attempt
    const c = await prisma.campaign.findUnique({ where: { id: body.campaign.id } });
    expect(c).toMatchObject({ status: 'completed', processed: 1, busy: 1, unanswered: 0 });
    expect((await balance(s.org.id)).available).toBe(1000);
  });

  test('no calls are placed outside 08:00–19:00 EAT', async () => {
    const s = await setup({ n: 2 });
    await launch(s).expect(201);
    const provider = fakeProvider();
    const stats = await runTick({ provider, now: outsideHours() });
    expect(stats.outsideHours).toBe(true);
    expect(provider.calls).toHaveLength(0);
  });

  test('cancel releases reserved credits; in-flight calls still settle', async () => {
    const s = await setup({ n: 8, concurrency: 2 });
    const { body } = await launch(s).expect(201);
    const provider = fakeProvider();
    await runTick({ provider, now: insideHours() });
    await api().post(`/api/v1/campaigns/${body.campaign.id}/cancel`).set(s.auth).expect(200);
    expect((await balance(s.org.id)).reserved).toBe(8); // 2 in flight hold the reservation
    await handleCallResult(provider.calls[0].attemptId, { outcome: 'played', durationSec: 20 });
    await handleCallResult(provider.calls[1].attemptId, { outcome: 'unanswered' });
    expect(await balance(s.org.id)).toEqual({ credits: 999, reserved: 0, available: 999 });
    const atts = await attemptsOf(body.campaign.id);
    expect(atts.filter((a) => a.status === 'cancelled')).toHaveLength(6);
    expect(atts).toHaveLength(8); // no retry for a cancelled campaign
  });

  test('pause stops dialing; resume continues', async () => {
    const s = await setup({ n: 3 });
    const { body } = await launch(s).expect(201);
    await api().post(`/api/v1/campaigns/${body.campaign.id}/pause`).set(s.auth).expect(200);
    const provider = fakeProvider();
    await runTick({ provider, now: insideHours() });
    expect(provider.calls).toHaveLength(0);
    await api().post(`/api/v1/campaigns/${body.campaign.id}/resume`).set(s.auth).expect(200);
    await runTick({ provider, now: insideHours() });
    expect(provider.calls).toHaveLength(3);
  });

  test('scheduled campaigns start at their time', async () => {
    const s = await setup({ n: 2 });
    const when = insideHours(3 * 3600);
    const { body } = await launch(s, { scheduledAt: when.toISOString() }).expect(201);
    expect(body.campaign.status).toBe('scheduled');
    const provider = fakeProvider();
    await runTick({ provider, now: new Date(when.getTime() - 60_000) });
    expect(provider.calls).toHaveLength(0);
    await runTick({ provider, now: when });
    expect(provider.calls).toHaveLength(2);
  });

  test('CSV export of per-call results', async () => {
    const s = await setup({ n: 2 });
    const { body } = await launch(s).expect(201);
    const res = await api()
      .get(`/api/v1/campaigns/${body.campaign.id}/calls.csv`)
      .set(s.auth)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')).toHaveLength(3);
  });
});

describe('approval flow', () => {
  test('unverified orgs cannot launch promotional/political campaigns', async () => {
    const s = await setup({ n: 2, verified: false });
    expect((await launch(s, { category: 'political' }).expect(403)).body.error.code).toBe(
      'ORG_NOT_VERIFIED',
    );
  });

  test('promotional campaigns wait for admin approval', async () => {
    const s = await setup({ n: 2, verified: true });
    const { body } = await launch(s, { category: 'promotional' }).expect(201);
    expect(body.campaign.status).toBe('pending_approval');
    const provider = fakeProvider();
    await runTick({ provider, now: insideHours() });
    expect(provider.calls).toHaveLength(0);

    // Customers cannot approve.
    await api()
      .post(`/api/v1/admin/approvals/${body.campaign.id}`)
      .set(s.auth)
      .send({ decision: 'approve' })
      .expect(403);

    const admin = await makeAdmin();
    const list = await api().get('/api/v1/admin/approvals').set(admin.auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    await api()
      .post(`/api/v1/admin/approvals/${body.campaign.id}`)
      .set(admin.auth)
      .send({ decision: 'approve' })
      .expect(200);
    await runTick({ provider, now: insideHours() });
    expect(provider.calls).toHaveLength(2);
  });

  test('rejecting releases the reservation', async () => {
    const s = await setup({ n: 5, verified: true });
    const { body } = await launch(s, { category: 'political' }).expect(201);
    expect((await balance(s.org.id)).reserved).toBe(5);
    const admin = await makeAdmin();
    const r = await api()
      .post(`/api/v1/admin/approvals/${body.campaign.id}`)
      .set(admin.auth)
      .send({ decision: 'reject', reason: 'Message is misleading' })
      .expect(200);
    expect(r.body.campaign).toMatchObject({
      status: 'rejected',
      rejectedReason: 'Message is misleading',
    });
    expect(await balance(s.org.id)).toEqual({ credits: 1000, reserved: 0, available: 1000 });
  });
});
