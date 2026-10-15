import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignmentInput, memberInput, taskActionInput, taskInput, websiteInput} from '../lib/live-validation';
const request_id = '00000000-0000-4000-8000-000000000001';
const valid = {request_id, name: 'UK', country: 'United Kingdom', cms: 'WordPress', url: 'https://EXAMPLE.org/'};
test('website validation normalizes identity and rejects credentials/unsafe URLs', () => {
  assert.equal(websiteInput(valid).url, 'https://example.org');
  for (const url of [
    'javascript:alert(1)',
    'https://user:password@example.org',
    'https://example.org?token=secret',
    'https://example.org#section',
    'not a url',
  ])
    assert.throws(() => websiteInput({...valid, url}));
  assert.throws(() => websiteInput({...valid, name: ''}));
});
test('task input rejects invalid dates, priorities and non-independent reviews', () => {
  const value = {
    request_id,
    title: 'New work',
    description: '',
    category: 'Development',
    priority: 'medium',
    website_ids: [],
    assignee_id: request_id,
    review_required: false,
  };
  assert.equal(taskInput(value).assignee_id, request_id);
  assert.throws(() => taskInput({...value, due_date: '2026-02-30'}));
  assert.throws(() => taskInput({...value, priority: 'critical'}));
  assert.throws(() => taskInput({...value, review_required: true, reviewer_id: request_id}));
  assert.throws(() => taskInput({...value, website_ids: ['invalid']}));
  assert.equal(taskInput({...value, website_ids: [request_id, request_id]}).website_ids.length, 1);
});
test('assignment responses require structured input, explicit decision and a decline reason', () => {
  for (const value of [null, {}, [], {request_id, accept: 'true'}, {request_id, accept: false, reason: ' '}])
    assert.throws(() => assignmentInput(value));
  assert.equal(assignmentInput({request_id, accept: true}).accept, true);
  assert.equal(assignmentInput({request_id, accept: false, reason: ' No capacity '}).reason, 'No capacity');
});
test('task mutations require a known action, workspace identities and current revision', () => {
  const input = {request_id, task_id: request_id, expected_revision: 1, action: 'comment', body: 'Hello'};
  assert.equal(taskActionInput(input).body, 'Hello');
  for (const change of [
    {expected_revision: 0},
    {expected_revision: '1'},
    {action: 'delete'},
    {body: ''},
    {mention_ids: ['invalid']},
    {action: 'handover', member_id: null},
  ])
    assert.throws(() => taskActionInput({...input, ...change}));
});
test('member forms accept only explicit workspace roles and correctly typed activation flags', () => {
  const input = {request_id, action: 'add', email: ' Person@Example.org ', display_name: 'Person', role: 'developer'};
  assert.equal(memberInput(input).email, 'person@example.org');
  for (const change of [
    {role: 'owner'},
    {email: 'bad'},
    {display_name: ''},
    {active: 'false'},
    {action: 'update', member_id: null},
  ])
    assert.throws(() => memberInput({...input, ...change}));
});
