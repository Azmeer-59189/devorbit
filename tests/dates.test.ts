import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarDate, dateRangeFilters, shiftDate, weekRange, workspaceDate} from '../lib/dates';

const id = '00000000-0000-4000-8000-000000000001';

test('weekly boundaries are Monday–Sunday and calendar dates respect workspace timezone', () => {
  assert.deepEqual(weekRange('2026-10-18'), {start: '2026-10-12', end: '2026-10-18'});
  assert.deepEqual(weekRange('2026-10-19'), {start: '2026-10-19', end: '2026-10-25'});
  assert.equal(workspaceDate('Asia/Karachi', new Date('2026-10-15T20:00:00Z')), '2026-10-16');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.throws(() => calendarDate('2026-02-29'));
});

test('date range filters keep explicit dates and paginate without losing filters', () => {
  const params = new URLSearchParams({start: '2026-10-12', end: '2026-10-18', page: '2', user: id, website: id});
  const result = dateRangeFilters(params);
  assert.equal(result.offset, 50);
  assert.equal(result.user_id, id);
  assert.equal(result.website_id, id);
  params.set('end', '2028-10-18');
  assert.throws(() => dateRangeFilters(params));
  params.set('end', '2026-10-18');
  params.set('page', '0');
  assert.throws(() => dateRangeFilters(params));
});
