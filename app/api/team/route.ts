import {AccessError, requireWorkspaceUser} from '@/lib/live-auth';
import {InputError, memberInput} from '@/lib/live-validation';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
export async function GET(request: Request) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    if (profile.role !== 'administrator') throw new AccessError(403, 'Administrator access required.');
    const {data, error} = await supabase.rpc('workspace_team_members');
    if (error) {
      if (error.code === 'PGRST202')
        throw new AccessError(503, 'Apply the new task-workflows-and-team migration to enable team administration.');
      throw rpcFailure(error);
    }
    return Response.json({members: data}, {headers: {'Cache-Control': 'private, no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    if (profile.role !== 'administrator') throw new AccessError(403, 'Administrator access required.');
    const input = memberInput(await request.json());
    const {data, error} = await supabase.rpc('manage_workspace_member', {p_input: input});
    if (error) {
      if (error.code === 'PGRST202')
        throw new AccessError(503, 'Apply the new task-workflows-and-team migration to enable team administration.');
      if (error.code === '23505')
        throw new AccessError(409, 'This account already has a workspace profile. Refresh the team list.');
      throw rpcFailure(error);
    }
    return Response.json({id: data}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error instanceof SyntaxError ? new InputError('Invalid member form.') : error);
  }
}
