import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dashboardActivity, readActivityTasks, type ActivityTask} from '../lib/dashboard-activity';
import type {SupabaseClient} from '@supabase/supabase-js';

const filters = {start: '2026-10-01', end: '2026-11-30', user_id: null, website_id: null};
const task = (id: string, patch: Partial<ActivityTask> = {}): ActivityTask => ({
  id,
  progress: 'completed',
  assignee_id: 'jasim',
  completed_at: '2026-10-31T20:00:00Z',
  task_websites: [{website_id: 'a'}, {website_id: 'b'}],
  ...patch,
});
test('historical charts include completed-only history, unlinked work and unique site links', () => {
  const result = dashboardActivity(
    [
      task('1'),
      task('2', {assignee_id: 'azmeer', completed_at: '2024-01-01T00:00:00Z', task_websites: []}),
      task('3', {progress: 'to_do', completed_at: null, task_websites: [{website_id: 'a'}, {website_id: 'a'}]}),
    ],
    filters,
    'Asia/Karachi',
  );
  assert.equal(result.completed, 2);
  assert.equal(result.trend.unit, 'week');
  assert.equal(result.trend.points.length, 9);
  // Oct 31 20:00 UTC is Nov 1 in Karachi, which falls in the week starting Oct 29.
  assert.deepEqual(
    result.trend.points.filter(p => p.count),
    [{date: '2026-10-29', count: 1, previous: 0}],
  );
  assert.equal(
    result.owners.reduce((n, r) => n + r.count, 0),
    2,
  );
  assert.equal(result.websites.find(r => r.id === 'a')?.count, 2);
  assert.equal(result.websites.find(r => r.id === 'unlinked')?.count, 1);
});
test('owner and website filters apply to every activity series', () => {
  const result = dashboardActivity(
    [task('1'), task('2', {assignee_id: 'azmeer'}), task('3', {task_websites: []})],
    {...filters, user_id: 'jasim', website_id: 'a'},
    'UTC',
  );
  assert.equal(result.completed, 1);
  assert.equal(
    result.trend.points.reduce((n, r) => n + r.count, 0),
    1,
  );
});
test('trend buckets follow the range length and line up with the period before it', () => {
  const done = (id: string, date: string) => task(id, {completed_at: `${date}T12:00:00Z`});
  const trend = (start: string, end: string, tasks: ActivityTask[]) =>
    dashboardActivity(tasks, {...filters, start, end}, 'UTC').trend;

  // Oct 6 is the third day of the 28 days before Nov 1 (Oct 4 to Oct 31), so it lines up with Nov 3.
  const days = trend('2026-11-01', '2026-11-28', [done('1', '2026-11-03'), done('2', '2026-10-06')]);
  assert.equal(days.unit, 'day');
  assert.equal(days.points.length, 28);
  assert.deepEqual(days.points[2], {date: '2026-11-03', count: 1, previous: 1});

  const weeks = trend('2026-09-01', '2026-11-30', [done('1', '2026-09-08'), done('2', '2026-06-02')]);
  assert.equal(weeks.unit, 'week');
  assert.equal(weeks.points.length, 13);
  assert.deepEqual(weeks.points[1], {date: '2026-09-08', count: 1, previous: 0});
  assert.equal(
    weeks.points.reduce((n, p) => n + p.previous, 0),
    1,
  );

  // Thirteen calendar months, so the previous window is Oct 7 2024 to Oct 6 2025.
  const months = trend('2025-11-07', '2026-11-06', [done('1', '2026-02-10'), done('2', '2025-01-15')]);
  assert.equal(months.unit, 'month');
  assert.equal(months.points.length, 13);
  assert.equal(months.points[0].date, '2025-11-01');
  // Jan 2025 is the fourth month after Oct 2024, so it lines up with Feb 2026.
  assert.deepEqual(months.points[3], {date: '2026-02-01', count: 1, previous: 1});

  // Work outside both windows is not counted.
  const outside = trend('2026-11-01', '2026-11-28', [done('1', '2026-10-03'), done('2', '2026-11-29')]);
  assert.equal(
    outside.points.reduce((n, p) => n + p.count + p.previous, 0),
    0,
  );
});
test('activity reader goes beyond preview and provider page limits, and fails on read errors', async () => {
  const calls: number[] = [];
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    is() {
      return this;
    },
    order() {
      return this;
    },
    async range(start: number) {
      calls.push(start);
      return {data: Array.from({length: start < 1000 ? 500 : 1}, (_, i) => task(String(start + i))), error: null};
    },
  };
  const client = {from: () => query} as unknown as SupabaseClient;
  assert.equal((await readActivityTasks(client, 'workspace')).length, 1001);
  assert.deepEqual(calls, [0, 500, 1000]);
  query.range = async () => {
    throw new Error('read failed');
  };
  await assert.rejects(readActivityTasks(client, 'workspace'), /read failed/);
});
