// Runs the Prisma CLI with the repo-root .env loaded (Prisma only looks next
// to the schema by default). Usage: node scripts/prisma.js migrate dev
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.resolve(here, '../.env'), path.resolve(here, '../../../.env')],
  quiet: true,
});

const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: path.resolve(here, '..'),
  env: process.env,
});
process.exit(r.status ?? 1);
