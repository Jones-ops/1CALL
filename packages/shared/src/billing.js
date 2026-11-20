// Credits and calling-hours rules shared by API, worker and app.

export const BILLING_UNIT_SECONDS = 30;
export const MAX_ATTEMPTS = 2;

/**
 * 1 credit per started 30 seconds of message (a <=30 s message = 1 credit).
 * Duration is rounded to the nearest second first so encoder padding
 * (e.g. 30.02 s) does not push a 30-second message into a second unit.
 */
export function creditsPerCall(durationSec) {
  const d = Math.max(0, Math.round(Number(durationSec) || 0));
  return Math.max(1, Math.ceil(d / BILLING_UNIT_SECONDS));
}

// Africa/Nairobi is UTC+3 all year (no daylight saving).
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_CALLING_HOURS = { startHour: 8, endHour: 19 };

function localMinutes(date) {
  const d = new Date(date.getTime() + NAIROBI_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** True when `date` falls in [startHour:00, endHour:00) East Africa Time. */
export function isWithinCallingHours(date = new Date(), hours = DEFAULT_CALLING_HOURS) {
  const m = localMinutes(date);
  return m >= hours.startHour * 60 && m < hours.endHour * 60;
}

/** The earliest moment >= `date` at which calls may be placed. */
export function nextCallingWindowStart(date = new Date(), hours = DEFAULT_CALLING_HOURS) {
  if (isWithinCallingHours(date, hours)) return new Date(date.getTime());
  const local = new Date(date.getTime() + NAIROBI_OFFSET_MS);
  const todayStartUtc =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hours.startHour) -
    NAIROBI_OFFSET_MS;
  return new Date(date.getTime() < todayStartUtc ? todayStartUtc : todayStartUtc + DAY_MS);
}

/** Start of the current day / month / year in Nairobi, as UTC Dates. */
export function nairobiPeriodStarts(now = new Date()) {
  const l = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  const y = l.getUTCFullYear();
  const mo = l.getUTCMonth();
  const d = l.getUTCDate();
  return {
    today: new Date(Date.UTC(y, mo, d) - NAIROBI_OFFSET_MS),
    month: new Date(Date.UTC(y, mo, 1) - NAIROBI_OFFSET_MS),
    year: new Date(Date.UTC(y, 0, 1) - NAIROBI_OFFSET_MS),
  };
}
