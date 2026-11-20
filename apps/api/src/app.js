import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import dashboardRouter from './routes/dashboard.js';
import contactsRouter, { groupsRouter } from './routes/contacts.js';
import recordingsRouter from './routes/recordings.js';
import campaignsRouter from './routes/campaigns.js';
import { plansRouter, subscriptionRouter, paymentsRouter, mockRouter } from './routes/billing.js';
import webhooksRouter from './routes/webhooks.js';
import adminRouter from './routes/admin.js';
import mediaRouter from './routes/media.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet());
  // The mobile app sends no Origin header; browsers are limited to CORS_ORIGINS.
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/media', mediaRouter);

  const v1 = express.Router();
  v1.get('/config', (_req, res) =>
    res.json({
      mockMode: config.mockVoice || config.mockPayments,
      mockVoice: config.mockVoice,
      mockPayments: config.mockPayments,
      bannerText: config.bannerText,
      callingHours: config.callingHours,
    }),
  );
  v1.use('/auth', authRouter);
  v1.use('/me', meRouter);
  v1.use('/dashboard', dashboardRouter);
  v1.use('/contacts', contactsRouter);
  v1.use('/groups', groupsRouter);
  v1.use('/recordings', recordingsRouter);
  v1.use('/campaigns', campaignsRouter);
  v1.use('/plans', plansRouter);
  v1.use('/subscription', subscriptionRouter);
  v1.use('/payments', paymentsRouter);
  v1.use('/webhooks', webhooksRouter);
  if (config.mockPayments) v1.use('/mock', mockRouter);
  v1.use('/admin', adminRouter);
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
