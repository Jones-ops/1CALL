// Turns pasted text, CSV or Excel files into {name, input} rows.
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { parseImportText } from '@1call/shared';
import { badRequest } from '../lib/errors.js';

export const MAX_IMPORT_ROWS = 50_000;

const PHONE_HDR = /phone|number|mobile|msisdn|tel|contact/i;
const NAME_HDR = /name/i;

/** Pick name/phone columns from a 2D array of cells. */
function rowsFromTable(table) {
  const clean = table
    .map((r) => (r || []).map((c) => (c === null || c === undefined ? '' : String(c).trim())))
    .filter((r) => r.some(Boolean));
  if (!clean.length) return [];

  let phoneCol = -1;
  let nameCol = -1;
  let start = 0;
  const header = clean[0];
  const headerLooksLikeHeader =
    header.some((c) => PHONE_HDR.test(c)) && !header.some((c) => /\d{6}/.test(c));
  if (headerLooksLikeHeader) {
    phoneCol = header.findIndex((c) => PHONE_HDR.test(c) && !NAME_HDR.test(c));
    if (phoneCol < 0) phoneCol = header.findIndex((c) => PHONE_HDR.test(c));
    nameCol = header.findIndex((c, i) => i !== phoneCol && NAME_HDR.test(c));
    start = 1;
  } else {
    // No header: the phone column is the one with the most digit-heavy cells.
    const width = Math.max(...clean.map((r) => r.length));
    let best = -1;
    for (let c = 0; c < width; c++) {
      const score = clean
        .slice(0, 50)
        .filter((r) => /\d{7,}/.test((r[c] || '').replace(/\D/g, ''))).length;
      if (score > best) {
        best = score;
        phoneCol = c;
      }
    }
    nameCol = phoneCol === 0 ? (width > 1 ? 1 : -1) : 0;
  }

  return clean.slice(start).map((r, i) => ({
    line: i + start + 1,
    name: nameCol >= 0 ? r[nameCol] || '' : '',
    input: r[phoneCol] || '',
  }));
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('text' in v) return v.text;
    if ('result' in v) return v.result;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
  }
  // Excel stores phone numbers as numbers and drops the leading 0.
  if (typeof v === 'number' && /^[17]\d{8}$/.test(String(v))) return `0${v}`;
  return v;
}

export async function parseImportFile(buffer, filename) {
  const ext = path.extname(filename || '').toLowerCase();
  let rows;
  if (ext === '.csv' || ext === '.txt') {
    const raw = buffer.toString('utf8');
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // strip BOM
    const table = parseCsv(text, {
      relax_column_count: true,
      skip_empty_lines: true,
      delimiter: [',', ';', '\t'],
    });
    rows = rowsFromTable(table);
  } else if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw badRequest('Could not read this Excel file.', 'IMPORT_FILE_INVALID');
    }
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const table = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      table.push(vals.map(cellText));
    });
    rows = rowsFromTable(table);
  } else {
    throw badRequest('Upload a .csv or .xlsx file.', 'IMPORT_FILE_TYPE');
  }
  return limit(rows);
}

export function parseText(text) {
  return limit(parseImportText(text));
}

function limit(rows) {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw badRequest(
      `An import can have at most ${MAX_IMPORT_ROWS.toLocaleString()} rows.`,
      'IMPORT_TOO_LARGE',
    );
  }
  return rows;
}
