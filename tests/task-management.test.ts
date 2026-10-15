import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskEditInput, taskMatches} from '../lib/task-management';
import {Task} from '../lib/live-types';
test('task edits ignore assignment and status inputs and validate details', () => {
  const input = {
    request_id: crypto.randomUUID(),
    task_id: crypto.randomUUID(),
    expected_revision: 1,
    title: 'Task',
    description: 'Context',
    category: 'General',
    priority: 'medium',
    due_date: '2026-10-20',
    website_ids: [],
    progress: 'completed',
    assignee_id: crypto.randomUUID(),
  };
  const result = taskEditInput(input);
  assert.ok(!('progress' in result));
  assert.ok(!('assignee_id' in result));
  assert.throws(() => taskEditInput({...input, due_date: '2026-02-30'}));
  assert.throws(() => taskEditInput({...input, expected_revision: 0}));
  assert.throws(() => taskEditInput({...input, title: ''}));
});
test('task filters combine owner, priority, status and overdue with calendar-day semantics', () => {
  const task = {assignee_id: 'owner', priority: 'high', progress: 'in_progress', due_date: '2026-10-14'} as Task;
  const filters = {status: 'in_progress', assignee: 'owner', priority: 'high', overdue: true};
  assert.equal(taskMatches(task, filters, '2026-10-15'), true);
  assert.equal(taskMatches({...task, due_date: '2026-10-15'}, filters, '2026-10-15'), false);
  assert.equal(taskMatches({...task, progress: 'completed'}, {...filters, status: 'all'}, '2026-10-15'), false);
  assert.equal(taskMatches(task, {...filters, assignee: 'unassigned'}, '2026-10-15'), false);
});
