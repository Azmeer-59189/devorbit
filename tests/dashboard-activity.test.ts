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
  assert.deepEqual(result.months, [
    {name: '2026-10', count: 0},
    {name: '2026-11', count: 1},
  ]);
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
    result.months.reduce((n, r) => n + r.count, 0),
    1,
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
