// Cross-process event bus. With REDIS_URL set, events published by the worker
// reach every API instance (which forwards them to Socket.IO). Without Redis
// everything runs in one process and a local EventEmitter is used.
import { EventEmitter } from 'node:events';
import { config } from '../config.js';

const CHANNEL = '1call:events';
const local = new EventEmitter();
local.setMaxListeners(100);

let pub = null;
let sub = null;

async function redis() {
  const { Redis } = await import('ioredis');
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

export async function publish(type, payload) {
  const msg = { type, payload };
  if (config.redisUrl) {
    if (!pub) pub = await redis();
    await pub.publish(CHANNEL, JSON.stringify(msg));
  } else {
    local.emit('event', msg);
  }
}

export async function subscribe(handler) {
  if (config.redisUrl) {
    if (!sub) {
      sub = await redis();
      await sub.subscribe(CHANNEL);
    }
    sub.on('message', (_ch, raw) => {
      try {
        handler(JSON.parse(raw));
      } catch (err) {
        console.error('[events] bad message', err.message);
      }
    });
  } else {
    local.on('event', handler);
  }
}

export async function closeEvents() {
  await Promise.all([pub?.quit(), sub?.quit()].filter(Boolean));
  pub = sub = null;
  local.removeAllListeners();
}
