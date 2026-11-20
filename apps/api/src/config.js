import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MOCK_BANNER_TEXT } from '@1call/shared';

// Load .env from the current directory first, then the repo root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: [path.resolve('.env'), path.join(repoRoot, '.env')], quiet: true });

const bool = (v, d) =>
  v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

// MOCK_MODE=true (default) forces every provider into mock mode.
const mockMode = bool(process.env.MOCK_MODE, true);
const voiceProvider = mockMode ? 'mock' : process.env.VOICE_PROVIDER || 'mock';
const mpesaEnv = mockMode ? 'mock' : process.env.MPESA_ENV || 'mock';

function secret(name, devDefault) {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`${name} must be set in production`);
  return devDefault;
}

const publicUrl = (
  process.env.PUBLIC_API_URL ||
  process.env.RENDER_EXTERNAL_URL || // set automatically on Render
  `http://localhost:${num(process.env.PORT, 4000)}`
).replace(/\/$/, '');

// Safaricom Daraja callback source IPs (production). Override with MPESA_ALLOWED_IPS.
const SAFARICOM_IPS = [
  '196.201.214.200',
  '196.201.214.206',
  '196.201.213.114',
  '196.201.214.207',
  '196.201.214.208',
  '196.201.213.44',
  '196.201.212.127',
  '196.201.212.138',
  '196.201.212.129',
  '196.201.212.136',
  '196.201.212.74',
  '196.201.212.69',
];

export const config = {
  env,
  isProd,
  isTest: env === 'test',
  port: num(process.env.PORT, 4000),
  publicUrl,
  appUrl: (process.env.APP_URL || publicUrl).replace(/\/$/, ''),
  trustProxy: num(process.env.TRUST_PROXY, 1),
  corsOrigins: list(process.env.CORS_ORIGINS),
  redisUrl: process.env.REDIS_URL || '',

  mockMode,
  get mockVoice() {
    return this.voice.provider === 'mock';
  },
  get mockPayments() {
    return this.mpesa.env === 'mock';
  },
  get bannerText() {
    if (this.mockVoice && this.mockPayments) return MOCK_BANNER_TEXT;
    if (this.mockVoice) return 'MOCK MODE – no real phone calls are placed.';
    if (this.mockPayments) return 'MOCK MODE – no real M-Pesa payments are taken.';
    return null;
  },

  auth: {
    jwtSecret: secret('JWT_SECRET', 'dev-only-jwt-secret-change-me'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlDays: num(process.env.REFRESH_TTL_DAYS, 30),
    requireEmailVerification: bool(process.env.REQUIRE_EMAIL_VERIFICATION, true),
  },

  mail: {
    smtpUrl: process.env.SMTP_URL || '',
    from: process.env.MAIL_FROM || '1CALL <no-reply@1call.example>',
  },

  storage: {
    driver: process.env.S3_BUCKET ? 's3' : 'local',
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, true),
    localDir: process.env.LOCAL_STORAGE_DIR || 'uploads',
    signingSecret: secret('MEDIA_SIGNING_SECRET', 'dev-only-media-secret'),
    urlTtlSec: num(process.env.MEDIA_URL_TTL_SEC, 900),
  },

  voice: {
    provider: voiceProvider,
    webhookSecret: secret('VOICE_WEBHOOK_SECRET', 'dev-voice-webhook-secret'),
    globalConcurrency: num(process.env.GLOBAL_CALL_CONCURRENCY, 100),
    retryDelaySec: num(process.env.RETRY_DELAY_SEC, 1800),
    ringTimeoutSec: num(process.env.RING_TIMEOUT_SEC, 180),
    tickMs: num(process.env.DIALER_TICK_MS, 2000),
    mockMinMs: num(process.env.MOCK_CALL_MIN_MS, 1500),
    mockMaxMs: num(process.env.MOCK_CALL_MAX_MS, 4000),
    costKesPerMinute: num(process.env.VOICE_COST_KES_PER_MIN, 2.5),
    at: {
      username: process.env.AT_USERNAME || 'sandbox',
      apiKey: process.env.AT_API_KEY || '',
      phoneNumber: process.env.AT_PHONE_NUMBER || '',
    },
  },

  callingHours: {
    startHour: num(process.env.CALLING_HOURS_START, 8),
    endHour: num(process.env.CALLING_HOURS_END, 19),
  },

  mpesa: {
    env: mpesaEnv, // mock | sandbox | production
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    shortcode: process.env.MPESA_SHORTCODE || '174379',
    passkey: process.env.MPESA_PASSKEY || '',
    transactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
    callbackToken: secret('MPESA_CALLBACK_TOKEN', 'dev-mpesa-callback-token'),
    allowedIps: list(process.env.MPESA_ALLOWED_IPS).length
      ? list(process.env.MPESA_ALLOWED_IPS)
      : SAFARICOM_IPS,
    enforceIpAllowlist: bool(process.env.MPESA_ENFORCE_IP_ALLOWLIST, mpesaEnv === 'production'),
  },
};
