import {InputError} from './live-validation';
import {recordId} from './reporting';
export function invitationInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Invalid invitation form.');
  const v = value as Record<string, unknown>;
  if (!['invite', 'resend', 'cancel'].includes(String(v.action))) throw new InputError('Invalid invitation action.');
  const base = {
    request_id: recordId(v.request_id)!,
    action: v.action,
    invitation_id: recordId(v.invitation_id, v.action !== 'invite'),
  };
  if (v.action !== 'invite') return base;
  const email = String(v.email ?? '')
    .trim()
    .toLowerCase();
  const display_name = String(v.display_name ?? '').trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !display_name ||
    display_name.length > 150 ||
    !['developer', 'manager', 'administrator'].includes(String(v.role))
  )
    throw new InputError('Enter a name, valid email and workspace role.');
  return {...base, email, display_name, role: v.role};
}
export function invitationOrigin(value: string | undefined) {
  if (!value) throw new Error('Set DEVORBIT_APP_URL to enable email invitations.');
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  )
    throw new Error('DEVORBIT_APP_URL must be the application origin (HTTPS in production).');
  return url.origin;
}
