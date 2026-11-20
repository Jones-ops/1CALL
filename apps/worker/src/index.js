// 1CALL worker: runs the BullMQ dialer (campaign dialing, retries, scheduled
// campaigns, stuck-call timeouts). The engine itself lives in
// @1call/api/engine so the API and worker share one implementation.
import { config } from '@1call/api/config.js';
import { prisma } from '@1call/api/db.js';
import { startBullScheduler, startInlineScheduler } from '@1call/api/engine/scheduler.js';
import { closeEvents } from '@1call/api/lib/events.js';

async function main() {
  console.log(`[worker] starting (voice=${config.voice.provider}, mock=${config.mockVoice})`);
  if (config.bannerText) console.log(`[worker] ${config.bannerText}`);

  let scheduler;
  if (config.redisUrl) {
    scheduler = await startBullScheduler();
  } else {
    console.warn(
      '[worker] REDIS_URL not set: running inline. Do not also run the API inline dialer.',
    );
    scheduler = startInlineScheduler();
  }

  const shutdown = async () => {
    console.log('[worker] shutting down');
    await scheduler.stop();
    await closeEvents();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
