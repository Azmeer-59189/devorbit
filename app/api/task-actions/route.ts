import {requireWorkspaceUser} from '@/lib/live-auth';
import {InputError, taskActionInput} from '@/lib/live-validation';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
export async function POST(request: Request) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const input = taskActionInput(await request.json());
    const {data, error} = await supabase.rpc('mutate_workspace_task', {p_input: input});
    if (error) {
      if (['PGRST202', '42883'].includes(error.code))
        throw new InputError('Run the new task-workflows-and-team migration before using this action.');
      throw rpcFailure(error);
    }
    return Response.json({id: data}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error instanceof SyntaxError ? new InputError('Invalid form data.') : error);
  }
}
