import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

const make = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit: config.isTest ? 10_000 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { message: 'Too many requests, please wait and try again.', code: 'RATE_LIMITED' },
    },
  });

export const authLimiter = make(15 * 60_000, 30);
export const paymentLimiter = make(60_000, 6);
export const webhookLimiter = make(60_000, 600);
