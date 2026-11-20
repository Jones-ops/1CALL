// Drives runTick(). Two modes:
//  - bullmq: a BullMQ job scheduler fires a "tick" job every DIALER_TICK_MS on
//            the "dialer" queue; one worker processes ticks (concurrency 1).
//            Used by apps/worker when REDIS_URL is set.
//  - inline: a setInterval in the current process (no Redis needed).
import { config } from '../config.js';
import { runTick } from './dialer.js';

export const DIALER_QUEUE = 'dialer';

let lastOutsideLog = 0;
async function tickSafely() {
  try {
    const s = await runTick();
    if (s.outsideHours && Date.now() - lastOutsideLog > 10 * 60_000) {
      lastOutsideLog = Date.now();
      console.log(`[dialer] outside calling hours; next window ${s.nextWindow?.toISOString()}`);
    }
    return s;
  } catch (err) {
    console.error('[dialer] tick failed', err);
    return null;
  }
}

export function startInlineScheduler() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    await tickSafely();
    running = false;
  }, config.voice.tickMs);
  console.log(`[dialer] inline scheduler running every ${config.voice.tickMs}ms`);
  return { stop: () => clearInterval(timer) };
}

export async function startBullScheduler() {
  const { Queue, Worker } = await import('bullmq');
  const { Redis } = await import('ioredis');
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(DIALER_QUEUE, { connection });
  await queue.upsertJobScheduler(
    'dialer-tick',
    { every: config.voice.tickMs },
    { name: 'tick', opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  const worker = new Worker(
    DIALER_QUEUE,
    async (job) => (job.name === 'tick' ? tickSafely() : null),
    {
      connection,
      concurrency: 1,
    },
  );
  worker.on('failed', (job, err) => console.error('[dialer] job failed', job?.name, err.message));
  console.log(`[dialer] BullMQ scheduler running every ${config.voice.tickMs}ms`);
  return {
    stop: async () => {
      await worker.close();
      await queue.close();
      await connection.quit();
    },
  };
}
