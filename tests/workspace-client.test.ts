import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSupabase} from '../lib/supabase';
import {workspaceFetch} from '../lib/workspace-client';

test('long audits retain their caller timeout instead of being cut off by the workspace 20-second default', async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  const client = createBrowserSupabase();
  const session = mock.method(client.auth, 'getSession', async () => ({
    data: {session: {access_token: 'test-token'}},
    error: null,
  }));
  const requested: number[] = [];
  const timeouts = mock.method(AbortSignal, 'timeout', (ms: number) => {
    requested.push(ms);
    return new AbortController().signal;
  });
  const longSignal = AbortSignal.timeout(245000);
  let signal: AbortSignal | null | undefined;
  const fetchMock = mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
    signal = init?.signal;
    return Response.json({state: 'completed'});
  });
  try {
    await workspaceFetch('/api/seo-health/automate', {method: 'POST', signal: longSignal});
    assert.equal(signal, longSignal);
    assert.deepEqual(requested, [245000]);
    await workspaceFetch('/api/seo-health');
    assert.deepEqual(requested, [245000, 20000]);
  } finally {
    session.mock.restore();
    timeouts.mock.restore();
    fetchMock.mock.restore();
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test('hosting error pages and timeouts give readable messages instead of JSON parse errors', async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  const client = createBrowserSupabase();
  const session = mock.method(client.auth, 'getSession', async () => ({
    data: {session: {access_token: 'test-token'}},
    error: null,
  }));
  let reply: () => Promise<Response> = async () =>
    new Response('<html>Gateway Timeout</html>', {status: 504, headers: {'Content-Type': 'text/html'}});
  const fetchMock = mock.method(globalThis, 'fetch', async () => reply());
  try {
    await assert.rejects(workspaceFetch('/api/workspace'), /took too long to respond/);
    reply = async () => new Response('<html>Bad Gateway</html>', {status: 502});
    await assert.rejects(workspaceFetch('/api/workspace'), /Unable to complete this request/);
    reply = async () => {
      throw new DOMException('signal timed out', 'TimeoutError');
    };
    await assert.rejects(workspaceFetch('/api/workspace'), /took too long to respond/);
    reply = async () => {
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(workspaceFetch('/api/workspace'), /Could not reach the server/);
    reply = async () => Response.json({error: 'Task not found.'}, {status: 404});
    await assert.rejects(workspaceFetch('/api/workspace'), /Task not found/);
  } finally {
    session.mock.restore();
    fetchMock.mock.restore();
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
