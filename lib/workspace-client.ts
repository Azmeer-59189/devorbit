import {createBrowserSupabase} from '@/lib/supabase';
export async function workspaceFetch(path: string, options: RequestInit = {}) {
  const {
    data: {session},
  } = await createBrowserSupabase().auth.getSession();
  if (!session) throw new Error('No saved session was found. Please sign in again.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error('The server took too long to respond. Check your connection and retry.');
    throw new Error('Could not reach the server. Check your connection and retry.');
  }
  // Hosting errors (for example a function timeout) return HTML pages rather than JSON.
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(
      data?.error ||
        (response.status === 504
          ? 'The server took too long to respond. Please retry.'
          : 'Unable to complete this request. Please retry.'),
    );
  return data;
}
