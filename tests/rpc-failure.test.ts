import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rpcFailure} from '../lib/live-mutations';

test('authored database messages reach the user with the right status', () => {
  const cases: [string, string, number][] = [
    ['P0001', 'Only the assignee or a manager can update progress.', 400],
    ['40001', 'Report changed; refresh before revising.', 409],
    ['54000', 'Invitation limit reached. Try again later.', 429],
    ['23505', 'This email already has workspace membership.', 409],
    ['42501', 'Only an independent reviewer or manager can decide this review.', 403],
  ];
  for (const [code, message, status] of cases) {
    const error = rpcFailure({code, message});
    assert.equal(error.status, status, code);
    assert.equal(error.message, message, code);
  }
});

test('built-in Postgres messages are replaced so internal names are not exposed', () => {
  const denied = rpcFailure({code: '42501', message: 'permission denied for table profiles'});
  assert.equal(denied.status, 403);
  assert.doesNotMatch(denied.message, /profiles/);
  const duplicate = rpcFailure({
    code: '23505',
    message: 'duplicate key value violates unique constraint "websites_url_key"',
  });
  assert.doesNotMatch(duplicate.message, /websites_url_key/);
  assert.match(
    rpcFailure({code: '40001', message: 'could not serialize access due to concurrent update'}).message,
    /changed/,
  );
  assert.match(rpcFailure({code: '54000', message: 'index row size exceeds maximum'}).message, /Too many requests/);
});

test('missing migrations and unknown failures use safe generic messages', () => {
  assert.equal(rpcFailure({code: 'PGRST202'}).status, 503);
  assert.equal(
    rpcFailure({code: '22P02', message: 'invalid input syntax for type uuid'}).message,
    'Some fields are invalid. Check the form and try again.',
  );
  assert.equal(rpcFailure({code: 'XX000', message: 'internal error'}).status, 503);
});
