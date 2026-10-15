import {InputError} from '@/lib/live-validation';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a real YYYY-MM-DD calendar date (rejects values like 2026-02-30). */
export function calendarDate(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new InputError('Choose a valid calendar date.');
  }
  return value;
}

function optionalId(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !uuid.test(value)) throw new InputError('Select a valid workspace record.');
  return value;
}

/** Parses start/end/page/user/website query parameters for date-ranged dashboard queries. */
export function dateRangeFilters(params: URLSearchParams) {
  const start = calendarDate(params.get('start'));
  const end = calendarDate(params.get('end'));
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (days < 0 || days > 366) throw new InputError('Choose a date range of at most 367 calendar days.');
  const page = params.get('page') || '1';
  if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 20001) throw new InputError('Choose a valid page.');
  return {
    start,
    end,
    user_id: optionalId(params.get('user')),
    website_id: optionalId(params.get('website')),
    limit: 50,
    offset: (Number(page) - 1) * 50,
  };
}

/** Today's calendar date in the workspace's timezone. */
export function workspaceDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function shiftDate(date: string, days: number) {
  const value = new Date(calendarDate(date) + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Monday–Sunday week containing the given date. */
export function weekRange(date: string) {
  const day = new Date(calendarDate(date) + 'T12:00:00Z').getUTCDay();
  const start = shiftDate(date, -((day + 6) % 7));
  return {start, end: shiftDate(start, 6)};
}
