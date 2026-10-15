import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptAssignment,
  activeTasks,
  declineAssignment,
  requestHandover,
  seed,
  totalMinutes,
  transition,
  validateLog,
  csv,
} from '../lib/domain';
test('pending assignments do not inflate accepted workload; acceptance changes owner', () => {
  const d = seed();
  const task = d.tasks.find(t => t.id === 'DEV-1037')!;
  assert.equal(activeTasks([task]).length, 0);
  const accepted = acceptAssignment(task, 'azmeer');
  assert.equal(accepted.assignee, 'azmeer');
  assert.equal(accepted.pending, null);
  assert.equal(activeTasks([accepted]).length, 1);
  assert.throws(() => acceptAssignment(task, 'jasim'));
});
test('decline requires a reason and retains task and prior ownership', () => {
  const task = {...seed().tasks[0], pending: 'jasim'};
  assert.throws(() => declineAssignment(task, 'jasim', ''));
  const declined = declineAssignment(task, 'jasim', 'Not available');
  assert.equal(declined.id, task.id);
  assert.equal(declined.assignee, task.assignee);
  assert.equal(declined.pending, null);
});
test('collaborators cannot complete another assignee task and independent review is required', () => {
  const task = seed().tasks[0];
  assert.throws(() => transition(task, 'Completed', 'sarah', 'Developer'));
  assert.throws(() => transition(task, 'Completed', 'azmeer', 'Administrator'));
  const review = transition(task, 'In Review', 'azmeer', 'Administrator');
  assert.equal(transition(review, 'Completed', 'omar', 'Manager').status, 'Completed');
  assert.throws(() => transition(review, 'Completed', 'azmeer', 'Administrator'));
});
test('blocker and reopen reasons are mandatory', () => {
  const task = seed().tasks[0];
  assert.throws(() => transition(task, 'Blocked', 'azmeer', 'Administrator'));
  assert.equal(transition(task, 'Blocked', 'azmeer', 'Administrator', 'Awaiting assets').blocker, 'Awaiting assets');
  assert.throws(() => transition({...task, status: 'Completed'}, 'In Progress', 'azmeer', 'Administrator'));
});
test('time belongs to contributors and multi-website logs count once', () => {
  const logs = seed().logs;
  assert.equal(totalMinutes(logs.slice(0, 1)), 360);
  assert.equal(totalMinutes(logs.filter(l => l.user === 'azmeer')), 1200);
  for (const n of [-1, 0, 1.1, NaN, 1441]) assert.throws(() => validateLog(n));
  validateLog(90);
});
test('CSV escapes delimiters, quotes and spreadsheet formulas', () => {
  const result = csv([{a: '=1+1', b: 'hello, "world"'}]);
  assert.ok(result.includes("'" + '=1+1'));
  assert.ok(result.includes('"hello, ""world"""'));
});
test('handover retains existing owner until acceptance and rejects pending requests', () => {
  const task = seed().tasks[0];
  const pending = requestHandover(task, 'jasim', 'azmeer', 'Developer');
  assert.equal(pending.assignee, 'azmeer');
  assert.equal(pending.pending, 'jasim');
  assert.equal(acceptAssignment(pending, 'jasim').assignee, 'jasim');
  assert.throws(() => requestHandover(pending, 'sarah', 'azmeer', 'Developer'));
  assert.throws(() => requestHandover(task, 'omar', 'azmeer', 'Developer'));
});
