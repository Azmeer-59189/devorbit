import {createRecord} from '@/lib/live-mutations';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {requireWorkspaceUser} from '@/lib/live-auth';
import {taskListFilters} from '@/lib/task-list';
export async function GET(request: Request) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const filters = taskListFilters(new URL(request.url).searchParams);
    const {data, error} = await supabase.rpc('workspace_task_list', {p_filters: filters});
    if (error) throw rpcFailure(error);
    return Response.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
export async function POST(request: Request) {
  return createRecord(request, 'task');
}
