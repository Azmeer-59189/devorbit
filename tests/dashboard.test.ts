import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weeklyTotals} from '../lib/dashboard';
test('dashboard weekly grouping uses Mondays, preserves minutes and does not invent missing dates', () => {
  const days = [
    {date: '2026-10-11', minutes: 60},
    {date: '2026-10-12', minutes: 90},
    {date: '2026-10-18', minutes: 30},
    {date: '2026-10-19', minutes: 0},
  ];
  const weeks = weeklyTotals(days);
  assert.deepEqual(weeks, [
    {date: '2026-10-05', minutes: 60},
    {date: '2026-10-12', minutes: 120},
    {date: '2026-10-19', minutes: 0},
  ]);
  assert.equal(
    weeks.reduce((n, d) => n + d.minutes, 0),
    180,
  );
  assert.deepEqual(weeklyTotals([]), []);
});
