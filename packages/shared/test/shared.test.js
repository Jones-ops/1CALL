import {
  normalizePhone,
  isKenyanMobile,
  parseImportText,
  classifyRows,
  creditsPerCall,
  isWithinCallingHours,
  nextCallingWindowStart,
} from '../src/index.js';

describe('normalizePhone', () => {
  test.each([
    ['0712345678', '+254712345678'],
    ['0112345678', '+254112345678'],
    ['0712 345 678', '+254712345678'],
    ['0712-345-678', '+254712345678'],
    ['(0712) 345.678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['254112345678', '+254112345678'],
    ['+254712345678', '+254712345678'],
    ['+44 20 7946 0958', '+442079460958'],
    ['+14155552671', '+14155552671'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  test.each([
    [''],
    [null],
    ['hello'],
    ['071234567'], // too short
    ['07123456789'], // too long
    ['0812345678'], // not 07/01
    ['+25471234567'], // malformed Kenyan
    ['+2548123456789'],
    ['712345678'],
    ['+1234567'], // fewer than 8 digits
    ['+1234567890123456'], // more than 15 digits
  ])('%s is invalid', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  test('isKenyanMobile', () => {
    expect(isKenyanMobile('0712345678')).toBe(true);
    expect(isKenyanMobile('+442079460958')).toBe(false);
  });
});

describe('import parsing', () => {
  test('parses numbers and name,number lines, skipping header and blanks', () => {
    const rows = parseImportText(
      'name,phone\nJane Doe,0712345678\n\n0722000111\nBob; 254733000222',
    );
    expect(rows).toEqual([
      { line: 2, name: 'Jane Doe', input: '0712345678' },
      { line: 4, name: '', input: '0722000111' },
      { line: 5, name: 'Bob', input: '254733000222' },
    ]);
  });

  test('classifies valid, duplicate (in import and existing) and invalid', () => {
    const rows = parseImportText('0712345678\n+254712345678\n0799999999\nabc');
    const { counts, rows: out } = classifyRows(rows, new Set(['+254799999999']));
    expect(counts).toEqual({ total: 4, valid: 1, duplicate: 2, invalid: 1 });
    expect(out.map((r) => r.status)).toEqual(['valid', 'duplicate', 'duplicate', 'invalid']);
  });
});

describe('credits', () => {
  test.each([
    [0, 1],
    [12, 1],
    [30, 1],
    [30.4, 1],
    [31, 2],
    [60, 2],
    [61, 3],
  ])('%ss -> %i credits', (d, c) => expect(creditsPerCall(d)).toBe(c));
});

describe('calling hours (Africa/Nairobi, UTC+3)', () => {
  const at = (iso) => new Date(iso);
  test('window is 08:00–19:00 EAT', () => {
    expect(isWithinCallingHours(at('2026-03-02T04:59:00Z'))).toBe(false); // 07:59 EAT
    expect(isWithinCallingHours(at('2026-03-02T05:00:00Z'))).toBe(true); // 08:00
    expect(isWithinCallingHours(at('2026-03-02T15:59:00Z'))).toBe(true); // 18:59
    expect(isWithinCallingHours(at('2026-03-02T16:00:00Z'))).toBe(false); // 19:00
  });

  test('next window start', () => {
    // 06:00 EAT -> 08:00 same day
    expect(nextCallingWindowStart(at('2026-03-02T03:00:00Z')).toISOString()).toBe(
      '2026-03-02T05:00:00.000Z',
    );
    // 21:00 EAT -> 08:00 next day
    expect(nextCallingWindowStart(at('2026-03-02T18:00:00Z')).toISOString()).toBe(
      '2026-03-03T05:00:00.000Z',
    );
    // 23:30 UTC = 02:30 EAT next day -> 08:00 that day
    expect(nextCallingWindowStart(at('2026-03-02T23:30:00Z')).toISOString()).toBe(
      '2026-03-03T05:00:00.000Z',
    );
    const inside = at('2026-03-02T09:00:00Z');
    expect(nextCallingWindowStart(inside).getTime()).toBe(inside.getTime());
  });
});
