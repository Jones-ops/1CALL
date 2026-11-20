import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { prisma } from './db.js';
import { startInlineScheduler } from './engine/scheduler.js';

const app = createApp();
const server = http.createServer(app);
attachRealtime(server);

let scheduler = null;
// Without Redis there is no separate worker: dial from this process.
if (!config.redisUrl && process.env.DISABLE_INLINE_DIALER !== 'true') {
  scheduler = startInlineScheduler();
}

server.listen(config.port, () => {
  console.log(`[api] 1CALL API listening on :${config.port} (${config.env})`);
  console.log(
    `[api] voice=${config.voice.provider} mpesa=${config.mpesa.env} storage=${config.storage.driver}`,
  );
  if (config.bannerText) console.log(`[api] ${config.bannerText}`);
});

async function shutdown() {
  console.log('[api] shutting down');
  scheduler?.stop();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
