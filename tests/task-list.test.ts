import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  taskListFilters,
  boardTransition,
  taskExportRows,
  taskFilterDefaults,
  taskFiltersFromSearch,
  taskFiltersToSearch,
} from '../lib/task-list';
import {Task, Website} from '../lib/live-types';
test('task list filters validate page, date, scope, sort and record identities', () => {
  const value = taskListFilters(new URLSearchParams('scope=created&page=3&sort=priority&overdue=true'));
  assert.equal(value.page, 3);
  assert.equal(value.scope, 'created');
  assert.equal(value.overdue, true);
  for (const query of [
    'page=0',
    'page=1.5',
    'sort=drop_table',
    'scope=someone',
    'start=2026-02-30',
    'start=2026-10-20&end=2026-10-01',
    'owner=bad',
  ])
    assert.throws(() => taskListFilters(new URLSearchParams(query)));
});
test('board affordances never allow bypassing ownership, acceptance or independent review', () => {
  const owner = {id: 'owner', display_name: 'Owner', role: 'developer'};
  const other = {...owner, id: 'other'};
  const task = {assignee_id: 'owner', progress: 'to_do', review_required: false} as Task;
  assert.equal(boardTransition(task, 'in_progress', owner), '');
  assert.match(boardTransition(task, 'completed', other), /owner or a manager/);
  assert.match(boardTransition({...task, assignee_id: null}, 'in_progress', owner), /Accept/);
  assert.match(boardTransition({...task, review_required: true}, 'completed', owner), /independent review/);
  assert.match(boardTransition({...task, progress: 'in_review'}, 'completed', owner), /review decision/);
  assert.equal(boardTransition({...task, progress: 'completed'}, 'to_do', owner), '');
  assert.match(boardTransition({...task, progress: 'completed'}, 'blocked', owner), /Reopen/);
});
test('task filters round-trip through the page URL and drop invalid values', () => {
  const owner = '00000000-0000-4000-8000-000000000002';
  const filters = {...taskFilterDefaults, status: 'open', owner, overdue: true, page: 3};
  const search = taskFiltersToSearch(filters);
  assert.equal(search.toString(), `owner=${owner}&status=open&overdue=true&page=3`);
  assert.deepEqual(taskFiltersFromSearch(search), filters);
  assert.equal(taskFiltersToSearch({}).toString(), '');
  assert.deepEqual(
    taskFiltersFromSearch(
      new URLSearchParams(
        'status=drop&owner=bad&website=1&start=2026-02-30&sort=x&page=-2&priority=urgent&q=' + 'x'.repeat(201),
      ),
    ),
    {...taskFilterDefaults, priority: 'urgent'},
  );
  assert.equal(taskFiltersFromSearch(new URLSearchParams('owner=unassigned')).owner, 'unassigned');
});
test('the server accepts the open status and export mode', () => {
  const value = taskListFilters(new URLSearchParams('status=open&export=true'));
  assert.equal(value.status, 'open');
  assert.equal(value.export, true);
  assert.equal(taskListFilters(new URLSearchParams('')).export, false);
});
test('task exports resolve people and websites and use workspace-local timestamps', () => {
  const task = {
    id: 't',
    title: 'Fix forms',
    description: '',
    category: 'General',
    priority: 'high',
    progress: 'in_progress',
    assignee_id: 'a',
    creator_id: 'gone',
    due_date: '2026-10-20',
    review_required: true,
    reviewer_id: 'b',
    created_at: '2026-10-15T20:30:00Z',
    revision: 1,
    blocker_reason: null,
    completed_at: null,
    website_ids: ['w1', 'w2'],
    pending_assignment_id: 'p',
    pending_recipient_id: 'b',
  };
  const [row] = taskExportRows([task], {
    members: [
      {id: 'a', display_name: 'Ayesha', role: 'developer'},
      {id: 'b', display_name: 'Bilal', role: 'manager'},
    ],
    websites: [{id: 'w1', name: 'UK'} as Website, {id: 'w2', name: 'Canada'} as Website],
    timezone: 'Asia/Karachi',
  });
  assert.equal(row.Status, 'In Progress');
  assert.equal(row.Owner, 'Ayesha');
  assert.equal(row['Awaiting acceptance by'], 'Bilal');
  assert.equal(row.Creator, 'Former member');
  assert.equal(row.Websites, 'UK, Canada');
  assert.equal(row.Created, '2026-10-16 01:30');
  assert.equal(row.Completed, '');
  assert.equal(
    taskExportRows([{...task, assignee_id: null}], {members: [], websites: [], timezone: 'UTC'})[0].Owner,
    'Unassigned',
  );
});
