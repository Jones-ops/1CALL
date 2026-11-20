// Publish an over-the-air update.
//   node scripts/publish-update.js preview "What changed"
// OTA updates are bundled on this computer, so the API address from eas.json's
// build profile must be set here too, or the update would ship without it.
const { spawnSync } = require('node:child_process');
const eas = require('../eas.json');

const channel = process.argv[2] || 'preview';
const message = process.argv[3] || `Update ${new Date().toISOString()}`;
const profile = eas.build[channel];
if (!profile) throw new Error(`No build profile "${channel}" in eas.json`);
const apiUrl = profile.env?.EXPO_PUBLIC_API_URL;
if (!apiUrl || !apiUrl.startsWith('https://'))
  throw new Error(`Profile "${channel}" has no https API URL`);

console.log(`Publishing to channel "${channel}" with API ${apiUrl}`);
const r = spawnSync(
  'npx',
  ['eas-cli@latest', 'update', '--channel', channel, '--message', JSON.stringify(message), '--non-interactive'],
  { stdio: 'inherit', shell: true, env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl } },
);
process.exit(r.status ?? 1);
