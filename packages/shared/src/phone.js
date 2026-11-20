// Phone normalisation — identical on the mobile client (preview) and the
// server (source of truth). Do not change one without the other: both import
// this file.

const STRIP = /[\s\-.()]/g;
const KE_LOCAL = /^0[17]\d{8}$/; // 07XXXXXXXX / 01XXXXXXXX
const KE_NO_PLUS = /^254[17]\d{8}$/; // 2547XXXXXXXX / 2541XXXXXXXX
const KE_E164 = /^\+254[17]\d{8}$/; // +2547XXXXXXXX / +2541XXXXXXXX
const E164 = /^\+[1-9]\d{7,14}$/; // + then 8–15 digits

/**
 * Normalise a phone number to E.164.
 * @param {unknown} input
 * @returns {string|null} E.164 string, or null when invalid.
 */
export function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(STRIP, '');
  if (!s) return null;
  if (KE_LOCAL.test(s)) return `+254${s.slice(1)}`;
  if (KE_NO_PLUS.test(s)) return `+${s}`;
  if (KE_E164.test(s)) return s;
  // A +254 number that is not a valid Kenyan mobile is rejected rather than
  // accepted as "international".
  if (s.startsWith('+254')) return null;
  if (E164.test(s)) return s;
  return null;
}

/** True when the input is a Kenyan mobile number usable for M-Pesa. */
export function isKenyanMobile(input) {
  const n = normalizePhone(input);
  return !!n && KE_E164.test(n);
}

/** +2547XXXXXXXX -> 2547XXXXXXXX (format Daraja expects). */
export function toMsisdn(input) {
  const n = normalizePhone(input);
  return n ? n.replace(/^\+/, '') : null;
}

const HEADER_HINT = /phone|number|mobile|msisdn|tel/i;

/**
 * Parse pasted text: one number per line, or "name,number".
 * Also accepts tab or semicolon separators. A header row is skipped.
 * @param {string} text
 * @returns {{line:number, name:string, input:string}[]}
 */
export function parseImportText(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const sep = line.match(/[,;\t]/);
    let name = '';
    let input = line;
    if (sep) {
      const cut = Math.max(line.lastIndexOf(','), line.lastIndexOf(';'), line.lastIndexOf('\t'));
      name = line.slice(0, cut).trim().replace(/^"|"$/g, '');
      input = line
        .slice(cut + 1)
        .trim()
        .replace(/^"|"$/g, '');
    }
    if (out.length === 0 && HEADER_HINT.test(input) && !/\d{5}/.test(input)) return;
    out.push({ line: idx + 1, name, input });
  });
  return out;
}

/**
 * Classify rows as valid / duplicate / invalid.
 * @param {{name?:string, input:string, line?:number}[]} rows
 * @param {Set<string>|string[]} [existing] E.164 numbers already in the target group.
 */
export function classifyRows(rows, existing = new Set()) {
  const known = existing instanceof Set ? existing : new Set(existing);
  const seen = new Set();
  const counts = { total: 0, valid: 0, duplicate: 0, invalid: 0 };
  const result = rows.map((r, i) => {
    counts.total += 1;
    const phone = normalizePhone(r.input);
    let status;
    if (!phone) status = 'invalid';
    else if (known.has(phone) || seen.has(phone)) status = 'duplicate';
    else status = 'valid';
    if (phone) seen.add(phone);
    counts[status] += 1;
    return {
      line: r.line ?? i + 1,
      name: (r.name || '').slice(0, 120),
      input: String(r.input ?? ''),
      phone,
      status,
    };
  });
  return { rows: result, counts };
}
