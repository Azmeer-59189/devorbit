import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskListFilters, boardTransition} from '../lib/task-list';
import {Task} from '../lib/live-types';
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
