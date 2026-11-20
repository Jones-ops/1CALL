// Seeds demo data. WARNING: wipes every table first (development only).
//   demo@1call.example  / Demo1234!   (customer, verified org, Basic plan)
//   admin@1call.example / Admin1234!  (platform admin)
import argon2 from 'argon2';
import { creditsPerCall } from '@1call/shared';
import { prisma } from '../src/db.js';
import { config } from '../src/config.js';
import { putObject } from '../src/services/storage.js';
import { makeToneWav } from '../src/services/audio.js';
import { simulateOutcome } from '../src/providers/voice/mock.js';

if (config.isProd && process.env.ALLOW_PROD_SEED !== 'true') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

// Deterministic RNG so the demo looks the same each time.
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261120);
const DAY = 86400_000;
const ago = (days, hours = 10) => new Date(Date.now() - days * DAY + (hours - 12) * 3600_000);

const FIRST = [
  'Achieng',
  'Brian',
  'Chebet',
  'David',
  'Esther',
  'Faith',
  'George',
  'Halima',
  'Ian',
  'Joy',
  'Kevin',
  'Lydia',
  'Moses',
  'Njeri',
  'Otieno',
  'Purity',
  'Qaasim',
  'Rose',
  'Samuel',
  'Tabitha',
];
const LAST = [
  'Wanjiku',
  'Otieno',
  'Kamau',
  'Mutua',
  'Njoroge',
  'Odhiambo',
  'Kiptoo',
  'Mwangi',
  'Akinyi',
  'Barasa',
];

async function reset() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.callAttempt.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.creditLedger.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.suppression.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.contactImport.deleteMany(),
    prisma.contactGroup.deleteMany(),
    prisma.recording.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.plan.deleteMany(),
    prisma.organization.deleteMany(),
  ]);
}

async function main() {
  await reset();
  const hash = (pw) => argon2.hash(pw, { type: argon2.argon2id });

  // ---- Plans ----
  const planDefs = [
    ['Starter', 1000, 500, 30, 500, 5],
    ['Basic', 3500, 2000, 30, 2000, 10],
    ['Professional', 8000, 5000, 30, 5000, 20],
    ['Business', 14000, 10000, 60, 10000, 30],
    ['Enterprise', 60000, 50000, 90, 50000, 60],
  ];
  const plans = {};
  for (const [
    i,
    [name, priceKes, credits, days, maxRecipients, concurrency],
  ] of planDefs.entries()) {
    plans[name] = await prisma.plan.create({
      data: { name, priceKes, credits, days, maxRecipients, concurrency, sortOrder: i },
    });
  }

  // ---- Admin ----
  await prisma.organization.create({
    data: {
      name: '1CALL Platform',
      verified: true,
      users: {
        create: {
          name: 'Platform Admin',
          email: 'admin@1call.example',
          phone: '+254700000001',
          role: 'admin',
          passwordHash: await hash('Admin1234!'),
          emailVerifiedAt: new Date(),
        },
      },
    },
  });

  // ---- Demo customer ----
  const org = await prisma.organization.create({
    data: { name: 'Hope Community Church', verified: true, createdAt: ago(60) },
  });
  const demo = await prisma.user.create({
    data: {
      orgId: org.id,
      name: 'Grace Wanjiru',
      email: 'demo@1call.example',
      phone: '+254712000111',
      role: 'owner',
      passwordHash: await hash('Demo1234!'),
      emailVerifiedAt: ago(60),
    },
  });

  // A second, unverified customer so the admin area has more than one row.
  await prisma.organization.create({
    data: {
      name: 'Sunrise Academy',
      users: {
        create: {
          name: 'Peter Kariuki',
          email: 'school@1call.example',
          phone: '+254722000222',
          role: 'owner',
          passwordHash: await hash('School1234!'),
          emailVerifiedAt: ago(10),
        },
      },
    },
  });

  // ---- Contacts: 120 in 3 groups ----
  const groupNames = ['Customers', 'Church Members', 'Parents'];
  const groups = [];
  let n = 0;
  for (const [gi, name] of groupNames.entries()) {
    const group = await prisma.contactGroup.create({
      data: { orgId: org.id, name, createdAt: ago(55 - gi) },
    });
    const imp = await prisma.contactImport.create({
      data: {
        orgId: org.id,
        userId: demo.id,
        groupId: group.id,
        source: 'paste',
        consentSource: ['existing_customer', 'paper_form', 'event_signup'][gi],
        declarationAccepted: true,
        totalRows: 40,
        validCount: 40,
        duplicateCount: 0,
        invalidCount: 0,
        importedCount: 40,
        ip: '127.0.0.1',
        createdAt: ago(55 - gi),
      },
    });
    const data = [];
    for (let i = 0; i < 40; i++, n++) {
      const prefix = n % 5 === 4 ? '1' : '7';
      const digits = String(10_000_000 + ((n * 7_919_123 + 1_234_567) % 89_999_999)).slice(0, 8);
      data.push({
        orgId: org.id,
        groupId: group.id,
        importId: imp.id,
        name: `${FIRST[n % FIRST.length]} ${LAST[(n * 3) % LAST.length]}`,
        phoneE164: `+254${prefix}${digits}`,
        consentSource: imp.consentSource,
        consentAt: imp.createdAt,
        createdAt: imp.createdAt,
      });
    }
    await prisma.contact.createMany({ data });
    groups.push(group);
  }

  // 3 opted out
  const all = await prisma.contact.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: 'asc' },
  });
  const optedOut = [all[5], all[47], all[93]];
  await prisma.suppression.createMany({
    data: optedOut.map((c, i) => ({
      orgId: org.id,
      phoneE164: c.phoneE164,
      source: i === 0 ? 'press9' : 'manual',
      createdAt: ago(20 - i),
    })),
  });
  const blocked = new Set(optedOut.map((c) => c.phoneE164));

  // ---- Recording ----
  const wav = makeToneWav(14);
  const key = `recordings/${org.id}/seed-sunday-reminder.wav`;
  await putObject(key, wav, 'audio/wav');
  const recording = await prisma.recording.create({
    data: {
      orgId: org.id,
      name: 'Sunday service reminder',
      storageKey: key,
      durationSec: 14,
      sizeBytes: wav.length,
      identifiesCaller: true,
      createdAt: ago(40),
    },
  });

  // ---- Payments & subscriptions ----
  const pay = async (plan, days, status, receipt) =>
    prisma.payment.create({
      data: {
        orgId: org.id,
        planId: plan.id,
        userId: demo.id,
        amountKes: plan.priceKes,
        phone: demo.phone,
        status,
        checkoutRequestId: `ws_CO_SEED_${days}_${status}`,
        merchantRequestId: `seed-${days}`,
        mpesaReceipt: receipt,
        resultCode: status === 'succeeded' ? 0 : 1032,
        resultDesc:
          status === 'succeeded'
            ? 'The service request is processed successfully.'
            : 'Request cancelled by user',
        createdAt: ago(days),
        processedAt: ago(days),
      },
    });
  const p1 = await pay(plans.Starter, 45, 'succeeded', 'SEED4A1B2C');
  await prisma.subscription.create({
    data: {
      orgId: org.id,
      planId: plans.Starter.id,
      paymentId: p1.id,
      startsAt: ago(45),
      expiresAt: ago(15),
    },
  });
  await prisma.creditLedger.create({
    data: {
      orgId: org.id,
      delta: 500,
      reason: 'purchase',
      refId: p1.id,
      note: 'Starter',
      createdAt: ago(45),
    },
  });
  await pay(plans.Basic, 8, 'failed', null);
  const p2 = await pay(plans.Basic, 7, 'succeeded', 'SEED9X8Y7Z');
  await prisma.subscription.create({
    data: {
      orgId: org.id,
      planId: plans.Basic.id,
      paymentId: p2.id,
      startsAt: ago(7),
      expiresAt: new Date(ago(7).getTime() + 30 * DAY),
    },
  });
  await prisma.creditLedger.create({
    data: {
      orgId: org.id,
      delta: 2000,
      reason: 'purchase',
      refId: p2.id,
      note: 'Basic',
      createdAt: ago(7),
    },
  });

  // ---- Campaign history (completed) ----
  const history = [
    ['Easter service invitation', groups[1], 40, 'informational'],
    ['Invoice reminder – March', groups[0], 30, 'transactional'],
    ['School fees reminder', groups[2], 5, 'informational'],
    ['Youth camp update', groups[1], 3, 'informational'],
  ];
  const cpc = creditsPerCall(recording.durationSec);
  for (const [name, group, daysAgo, category] of history) {
    const contacts = all.filter((c) => c.groupId === group.id && !blocked.has(c.phoneE164));
    const start = ago(daysAgo, 9);
    const reserved = contacts.length * cpc;
    const camp = await prisma.campaign.create({
      data: {
        orgId: org.id,
        createdById: demo.id,
        name,
        groupId: group.id,
        recordingId: recording.id,
        category,
        status: 'completed',
        concurrency: 5,
        creditsPerCall: cpc,
        recipients: contacts.length,
        creditsReserved: reserved,
        declarationsAccepted: true,
        declarationsAt: start,
        startedAt: start,
        completedAt: new Date(start.getTime() + 40 * 60_000),
        createdAt: start,
      },
    });
    const t = {
      processed: 0,
      answered: 0,
      played: 0,
      unanswered: 0,
      busy: 0,
      failed: 0,
      creditsUsed: 0,
    };
    const attempts = [];
    const ledger = [
      {
        orgId: org.id,
        delta: -reserved,
        reason: 'campaign_reserve',
        refId: camp.id,
        createdAt: start,
      },
    ];
    for (const c of contacts) {
      let attemptNo = 1;
      let r = simulateOutcome(rand, { messageSec: recording.durationSec });
      const base = {
        campaignId: camp.id,
        contactId: c.id,
        orgId: org.id,
        phoneE164: c.phoneE164,
        contactName: c.name,
      };
      if (r.outcome === 'unanswered' || r.outcome === 'busy') {
        attempts.push({
          ...base,
          attemptNo: 1,
          status: r.outcome,
          dialedAt: start,
          endedAt: start,
        });
        attemptNo = 2;
        r = simulateOutcome(rand, { messageSec: recording.durationSec });
      }
      const answered = r.outcome === 'answered' || r.outcome === 'played';
      const ended = new Date(start.getTime() + (attemptNo === 2 ? 35 : 5) * 60_000);
      const id = `seed_${camp.id.slice(-6)}_${t.processed}`;
      attempts.push({
        ...base,
        id,
        attemptNo,
        status: r.outcome,
        durationSec: r.durationSec,
        creditsCharged: answered ? cpc : 0,
        dialedAt: ended,
        endedAt: ended,
      });
      t.processed++;
      if (answered) {
        t.answered++;
        t.creditsUsed += cpc;
        ledger.push({
          orgId: org.id,
          delta: -cpc,
          reason: 'call_charge',
          refId: id,
          createdAt: ended,
        });
        ledger.push({
          orgId: org.id,
          delta: cpc,
          reason: 'campaign_release',
          refId: camp.id,
          note: 'charged',
          createdAt: ended,
        });
      }
      if (r.outcome === 'played') t.played++;
      if (r.outcome === 'unanswered') t.unanswered++;
      if (r.outcome === 'busy') t.busy++;
      if (r.outcome === 'failed') t.failed++;
    }
    if (reserved - t.creditsUsed > 0) {
      ledger.push({
        orgId: org.id,
        delta: reserved - t.creditsUsed,
        reason: 'campaign_release',
        refId: camp.id,
        note: 'unused',
        createdAt: camp.completedAt,
      });
    }
    await prisma.callAttempt.createMany({ data: attempts });
    await prisma.creditLedger.createMany({ data: ledger });
    await prisma.campaign.update({ where: { id: camp.id }, data: t });
  }

  console.log('Seed complete.');
  console.log('  Customer: demo@1call.example / Demo1234!');
  console.log('  Admin:    admin@1call.example / Admin1234!');
  console.log('  Second customer (unverified org): school@1call.example / School1234!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
