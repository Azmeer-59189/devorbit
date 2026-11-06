import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(
  readFileSync('scripts/google-task-sheet.gs', 'utf8') +
    ';globalThis.helpers={taskSheetColumns,taskSheetWebsites,TASK_HEADERS};',
  context,
);
const helpers = context.helpers;
const options = new Set(['France', 'Denmark', 'Finland']);
const parse = (value: string) => Array.from(helpers.taskSheetWebsites(value, options, 'Row 2: '));
test('website chips support one, multiple, duplicate and all-website selections', () => {
  assert.deepEqual(parse('France'), ['France']);
  assert.deepEqual(parse('France, Denmark'), ['France', 'Denmark']);
  assert.deepEqual(parse('France; Denmark; France'), ['France', 'Denmark']);
  assert.deepEqual(parse('All websites'), [...options]);
  assert.deepEqual(parse('France, All websites'), [...options]);
  assert.deepEqual(parse(''), []);
  assert.throws(() => parse('Frnace'), /dropdown/);
  assert.throws(() => parse('All websites, Frnace'), /dropdown/);
});
test('sync maps both member sheet layouts without shifting priority, status or dates', () => {
  const current = helpers.taskSheetColumns(helpers.TASK_HEADERS, 'azmeer');
  assert.equal(current.priority, 3);
  assert.equal(current.status, 4);
  assert.equal(current.created, 5);
  assert.equal(current.completed, 6);
  assert.equal(current.archived, 7);
  assert.deepEqual(Array.from(current.websites), [2]);
  const old = helpers.taskSheetColumns(
    [
      'Task ID',
      'Title',
      'Website',
      'Website 2',
      'Website 3',
      'Priority',
      'Status',
      'Created date',
      'Completed date',
      'Archived',
    ],
    'azmeer',
  );
  assert.equal(old.priority, 5);
  assert.equal(old.status, 6);
  assert.deepEqual(Array.from(old.websites), [2, 3, 4]);
  assert.throws(() => helpers.taskSheetColumns(['Task ID', 'Task ID'], 'azmeer'), /expected one/);
});
