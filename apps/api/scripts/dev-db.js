// Local development database without installing PostgreSQL or Docker.
// Starts an embedded PostgreSQL 17 whose data persists in apps/api/.dev-pg.
//   npm run db        (leave it running in its own terminal)
// Connection: postgresql://onecall:onecall@localhost:5433/onecall
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../.dev-pg');
const port = Number(process.env.DEV_DB_PORT || 5433);
const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'onecall',
  password: 'onecall',
  port,
  persistent: true,
  onLog: () => {},
});

if (firstRun) {
  console.log(`[db] creating a new database cluster in ${dataDir}`);
  await pg.initialise();
}
await pg.start();
if (firstRun) await pg.createDatabase('onecall');

console.log(`[db] PostgreSQL running: postgresql://onecall:onecall@localhost:${port}/onecall`);
console.log('[db] Press Ctrl+C to stop (data is kept).');

const stop = async () => {
  console.log('\n[db] stopping…');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
