import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.MOCK_MODE = 'true';
process.env.REDIS_URL = '';
process.env.DATABASE_URL = fs
  .readFileSync(path.join(os.tmpdir(), '1call-test-db-url'), 'utf8')
  .trim();
process.env.LOCAL_STORAGE_DIR = path.join(os.tmpdir(), '1call-test-uploads');
process.env.RETRY_DELAY_SEC = '1800';
process.env.SMTP_URL = '';
