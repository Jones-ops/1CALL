// Production-safe first-run setup. Runs on every deploy and NEVER deletes data:
//  - creates the 5 default plans if there are no plans yet
//  - creates the platform admin from ADMIN_EMAIL / ADMIN_PASSWORD if that user doesn't exist
import argon2 from 'argon2';
import '../src/config.js';
import { prisma } from '../src/db.js';

const PLANS = [
  ['Starter', 1000, 500, 30, 500, 5],
  ['Basic', 3500, 2000, 30, 2000, 10],
  ['Professional', 8000, 5000, 30, 5000, 20],
  ['Business', 14000, 10000, 60, 10000, 30],
  ['Enterprise', 60000, 50000, 90, 50000, 60],
];

async function main() {
  if ((await prisma.plan.count()) === 0) {
    await prisma.plan.createMany({
      data: PLANS.map(([name, priceKes, credits, days, maxRecipients, concurrency], i) => ({
        name,
        priceKes,
        credits,
        days,
        maxRecipients,
        concurrency,
        sortOrder: i,
      })),
    });
    console.log('[bootstrap] created default plans');
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (email && password) {
    if (!(await prisma.user.findUnique({ where: { email } }))) {
      if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
      await prisma.user.create({
        data: {
          name: 'Platform Admin',
          email,
          role: 'admin',
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          emailVerifiedAt: new Date(),
          org: { create: { name: '1CALL Platform', verified: true } },
        },
      });
      console.log(`[bootstrap] created admin ${email}`);
    }
  } else {
    console.log('[bootstrap] ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin created');
  }
}

main()
  .catch((e) => {
    console.error('[bootstrap] failed', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
