import {AccessError, requireWorkspaceUser} from '@/lib/live-auth';
import {InputError, readJson, taskInput, websiteInput} from '@/lib/live-validation';

export function mutationFailure(error: unknown) {
  if (error instanceof InputError)
    return Response.json({error: error.message}, {status: 400, headers: {'Cache-Control': 'no-store'}});
  if (error instanceof AccessError)
    return Response.json({error: error.message}, {status: error.status, headers: {'Cache-Control': 'no-store'}});
  return Response.json(
    {error: 'Unable to save this record. Please try again.'},
    {status: 500, headers: {'Cache-Control': 'no-store'}},
  );
}
// Messages DevOrbit's own SQL raises are written for users and shown as-is.
// Postgres's built-in messages for the same codes can expose table or
// constraint names, so those fall back to generic wording.
const builtInMessage: Record<string, RegExp> = {
  '42501': /^permission denied/i,
  '40001': /^could not serialize/i,
  '23505': /^duplicate key value/i,
  '54000': /^(?!(Too many|Wait at least|Invitation limit))/,
};
const statusFor: Record<string, number> = {'42501': 403, '40001': 409, '23505': 409, '54000': 429, P0001: 400};
const fallback: Record<string, string> = {
  '42501': 'You do not have permission to perform this action.',
  '40001': 'This record changed. Refresh it before saving. Your draft has been kept.',
  '23505': 'This record already exists.',
  '54000': 'Too many requests. Wait a minute and retry.',
};

export function rpcFailure(error: {code?: string; message?: string}) {
  const code = error.code || '';
  const message = (error.message || '').trim();
  if (['PGRST202', '42883'].includes(code)) {
    return new AccessError(
      503,
      'This feature is not enabled in the database yet. Ask your administrator to apply the latest workspace migration, then retry.',
    );
  }
  if (code === 'P0001' && message && message.length <= 500) return new AccessError(400, message);
  if (code in fallback) {
    const authored = message && message.length <= 500 && !builtInMessage[code].test(message);
    return new AccessError(statusFor[code], authored ? message : fallback[code]);
  }
  if (['22023', '22P02', '22007', '22008', '23514', 'P0001'].includes(code))
    return new AccessError(400, 'Some fields are invalid. Check the form and try again.');
  return new AccessError(503, 'The database could not save this record. Please retry.');
}
export async function createRecord(request: Request, kind: 'website' | 'task') {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    if (kind === 'website' && !['administrator', 'manager'].includes(profile.role))
      throw new AccessError(403, 'Only administrators and managers can add websites.');
    const input = await readJson(request, 24000);
    const values = kind === 'website' ? websiteInput(input) : taskInput(input);
    const {data, error} = await supabase.rpc(
      kind === 'website' ? 'create_workspace_website' : 'create_workspace_task',
      {p_input: values},
    );
    if (error) throw rpcFailure(error);
    return Response.json({id: data}, {status: 201, headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
