import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invitationInput, invitationOrigin} from '../lib/invitations';
test('invitation inputs require explicit roles and valid identities', () => {
  const input = {
    request_id: crypto.randomUUID(),
    action: 'invite',
    email: ' NEW@example.org ',
    display_name: 'New teammate',
    role: 'developer',
  };
  assert.equal((invitationInput(input) as {email: string}).email, 'new@example.org');
  assert.throws(() => invitationInput({...input, role: 'owner'}));
  assert.throws(() => invitationInput({...input, email: 'bad'}));
  assert.throws(() => invitationInput({...input, action: 'resend'}));
  assert.equal(
    invitationInput({request_id: crypto.randomUUID(), action: 'cancel', invitation_id: crypto.randomUUID()}).action,
    'cancel',
  );
});
test('invitation redirects come from configured HTTPS origin, with local development allowed', () => {
  assert.equal(invitationOrigin('https://devorbit.example.org'), 'https://devorbit.example.org');
  assert.equal(invitationOrigin('http://localhost:3000'), 'http://localhost:3000');
  for (const value of [
    undefined,
    'http://public.example.org',
    'https://user:pass@example.org',
    'https://example.org/path',
    'https://example.org/?redirect=evil',
    'javascript:alert(1)',
  ])
    assert.throws(() => invitationOrigin(value));
});
