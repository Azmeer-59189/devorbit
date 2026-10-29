import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskSheetRows, validSheetSecret} from '../lib/task-sheet';
const row = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Fix donation page',
  description: '',
  assignee: 'Azmeer',
  websites: 'France; Denmark',
  category: 'website',
  priority: 'High',
  status: 'In progress',
  created_date: '2026-10-29',
  due_date: '',
  completed_date: '',
  blocker: '',
  completion_notes: '',
  archived: 'No',
};
test('sheet rows normalize statuses, link website names and reject invalid dates and duplicates', () => {
  const parse = (rows: unknown[]) => taskSheetRows({sheet_id: 'sheet123456', rows}, 'sheet123456');
  assert.equal(parse([row])[0].status, 'in_progress');
  assert.deepEqual(parse([row])[0].websites, ['France', 'Denmark']);
  assert.throws(() => parse([row, row]), /duplicated/);
  assert.throws(() => parse([{...row, due_date: '2026-02-30'}]), /valid YYYY/);
  assert.throws(() => parse([{...row, status: 'Completed'}]), /completed date/);
  assert.throws(() => parse([{...row, status: 'Blocked'}]), /blocker/);
  assert.throws(() => taskSheetRows({sheet_id: 'other', rows: [row]}, 'sheet123456'), /not connected/);
});
test('sheet sync requires the complete secret and rejects missing or undersized keys', () => {
  const key = 'a'.repeat(64);
  assert.equal(validSheetSecret('Bearer ' + key, key), true);
  assert.equal(validSheetSecret('Bearer ' + key + 'b', key), false);
  assert.equal(validSheetSecret(null, key), false);
  assert.equal(validSheetSecret('Bearer short', 'short'), false);
});

test('simplified member sheets omit removed fields instead of clearing saved details', () => {
  const {description, due_date, blocker, completion_notes, category, ...simple} = row;
  void category;
  void description;
  void due_date;
  void blocker;
  void completion_notes;
  const result = taskSheetRows({sheet_id: 'sheet123456', rows: [{...simple, status: 'Blocked'}]}, 'sheet123456')[0];
  for (const key of ['description', 'due_date', 'blocker', 'completion_notes', 'category'])
    assert.equal(key in result, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.assignee, 'Azmeer');
});
