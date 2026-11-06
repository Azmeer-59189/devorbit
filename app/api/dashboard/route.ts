import {requireWorkspaceUser, AccessError} from '@/lib/live-auth';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {dateRangeFilters} from '@/lib/dates';
import {dashboardActivity, readActivityTasks} from '@/lib/dashboard-activity';
export async function GET(request: Request) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    const params = new URL(request.url).searchParams;
    const filters = dateRangeFilters(params);
    const source = params.get('source') || '';
    if (source.length > 500) throw new AccessError(400, 'Invalid SEO source.');
    const {data, error} = await supabase.rpc('workspace_dashboard', {p_filters: {...filters, source}});
    if (error) throw rpcFailure(error);
    const {data: workspace, error: workspaceError} = await supabase
      .from('workspaces')
      .select('timezone')
      .eq('id', profile.workspace_id)
      .single();
    if (workspaceError) throw rpcFailure(workspaceError);
    const tasks = await readActivityTasks(supabase, profile.workspace_id);
    return Response.json(
      {...data, activity: dashboardActivity(tasks, filters, workspace.timezone)},
      {headers: {'Cache-Control': 'no-store'}},
    );
  } catch (error) {
    return mutationFailure(error);
  }
}
