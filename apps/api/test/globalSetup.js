// Provides a Postgres for the test run: TEST_DATABASE_URL if set, otherwise an
// embedded Postgres started on the fly. The schema is pushed with Prisma.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const URL_FILE = path.join(os.tmpdir(), '1call-test-db-url');

export default async function globalSetup() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const port = 55_000 + Math.floor(Math.random() * 5000);
    const dir = path.join(here, '..', '.test-pg', String(port));
    const pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('onecall_test');
    globalThis.__EMBEDDED_PG__ = pg;
    url = `postgresql://postgres:postgres@localhost:${port}/onecall_test`;
  }
  fs.writeFileSync(URL_FILE, url);

  const require = createRequire(import.meta.url);
  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'],
    { cwd: path.join(here, '..'), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' },
  );
}
