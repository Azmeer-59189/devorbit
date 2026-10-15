import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliverInvitation} from '../lib/invitation-mail';
test('email delivery uses fixed redirects and existing-user resends cannot create users', async () => {
  const original = globalThis.fetch;
  const calls: {url: string; body: Record<string, unknown>}[] = [];
  let existing = false;
  let denied = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({url, body: JSON.parse(String(init?.body || '{}'))});
    if (url.includes('/invite') && (existing || denied))
      return Response.json(
        {
          code: denied ? 'over_email_send_rate_limit' : 'email_exists',
          error_code: denied ? 'over_email_send_rate_limit' : 'email_exists',
          msg: 'Provider rejected request',
        },
        {status: 422, headers: {'x-supabase-api-version': '2024-01-01'}},
      );
    return Response.json({id: '00000000-0000-4000-8000-000000000010', email: 'invited@example.org'});
  };
  try {
    const config = {secret: 'test-key', url: 'https://test.supabase.co', origin: 'https://devorbit.example.org'};
    const id = crypto.randomUUID();
    assert.equal(await deliverInvitation('invited@example.org', id, config), true);
    assert.equal(
      new URL(calls[0].url).searchParams.get('redirect_to'),
      `https://devorbit.example.org/join?invitation=${id}`,
    );
    existing = true;
    calls.length = 0;
    assert.equal(await deliverInvitation('invited@example.org', id, config), true);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.includes('/otp'));
    assert.equal(calls[1].body.create_user, false);
    denied = true;
    calls.length = 0;
    assert.equal(await deliverInvitation('invited@example.org', id, config), false);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
