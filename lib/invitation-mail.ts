import {createClient} from '@supabase/supabase-js';
import {invitationOrigin} from './invitations';
// Imported only by a server route. Never use a NEXT_PUBLIC variable for this key.
export function invitationMailConfig() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !url)
    throw new Error('Set the server-only SUPABASE_SECRET_KEY and DEVORBIT_APP_URL to enable invitation emails.');
  return {secret, url, origin: invitationOrigin(process.env.DEVORBIT_APP_URL)};
}
export async function deliverInvitation(email: string, id: string, config: ReturnType<typeof invitationMailConfig>) {
  const client = createClient(config.url, config.secret, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  const redirectTo = `${config.origin}/join?invitation=${encodeURIComponent(id)}`;
  const result = await client.auth.admin.inviteUserByEmail(email, {redirectTo});
  if (!result.error) return true;
  if (!['email_exists', 'user_already_exists'].includes(result.error.code || '')) return false;
  const retry = await client.auth.signInWithOtp({
    email,
    options: {shouldCreateUser: false, emailRedirectTo: redirectTo},
  });
  return !retry.error;
}
