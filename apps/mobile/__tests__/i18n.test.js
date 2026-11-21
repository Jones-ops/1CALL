/* global __dirname */
import fs from 'node:fs';
import path from 'node:path';
import en from '../src/i18n/en';
import sw from '../src/i18n/sw';
import { translate } from '../src/i18n';

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('English and Kiswahili have exactly the same keys', () => {
  const enKeys = Object.keys(en).sort();
  const swKeys = Object.keys(sw).sort();
  expect(swKeys.filter((k) => !en[k])).toEqual([]);
  expect(enKeys.filter((k) => !sw[k])).toEqual([]);
});

test('every translation key used in the code exists', () => {
  const src = sourceFiles(path.join(__dirname, '..', 'src'))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const used = new Set([...src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]));
  // Keys chosen with a ternary: t(cond ? 'a.b' : 'c.d')
  for (const m of src.matchAll(
    /\bt\(\s*[^'`)]*\?\s*'([a-zA-Z0-9_.]+)'\s*:\s*'([a-zA-Z0-9_.]+)'/g,
  )) {
    used.add(m[1]);
    used.add(m[2]);
  }
  const missing = [...used].filter((k) => !(k in en));
  expect(missing).toEqual([]);
});

test('dynamic key families are complete', () => {
  const families = {
    status: [
      'draft',
      'pending_approval',
      'scheduled',
      'running',
      'paused',
      'completed',
      'cancelled',
      'rejected',
    ],
    call: [
      'queued',
      'ringing',
      'answered',
      'played',
      'unanswered',
      'busy',
      'failed',
      'suppressed',
      'cancelled',
    ],
    category: ['informational', 'transactional', 'promotional', 'political'],
    consent: ['web_form', 'sms_optin', 'event_signup', 'paper_form', 'existing_customer'],
    payStatus: ['succeeded', 'failed', 'pending'],
    orgStatus: ['active', 'suspended'],
    'import.st': ['valid', 'duplicate', 'invalid'],
    'live.done': ['pause', 'resume', 'cancel'],
    'admin.f': ['priceKes', 'credits', 'days', 'maxRecipients', 'concurrency'],
  };
  const missing = [];
  for (const [prefix, values] of Object.entries(families)) {
    const sep = prefix.includes('.') ? '_' : '.';
    for (const v of values) if (!en[`${prefix}${sep}${v}`]) missing.push(`${prefix}${sep}${v}`);
  }
  expect(missing).toEqual([]);
});

test('placeholders are filled in', () => {
  expect(translate('en', 'import.add', { n: 3 })).toBe('Add 3 contacts');
  expect(translate('sw', 'import.add', { n: 3 })).toBe('Ongeza anwani 3');
  expect(translate('sw', 'no.such.key')).toBe('no.such.key');
});
