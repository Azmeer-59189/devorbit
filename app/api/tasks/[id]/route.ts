import {AccessError, requireWorkspaceUser} from '@/lib/live-auth';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {taskEditInput} from '@/lib/task-management';
export async function PATCH(request: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const input = taskEditInput(await request.json());
    if (input.task_id !== (await params).id) throw new AccessError(400, 'Task identity does not match.');
    const {data, error} = await supabase.rpc('edit_workspace_task', {p_input: input});
    if (error) throw rpcFailure(error);
    return Response.json({id: data});
  } catch (error) {
    return mutationFailure(error);
  }
}
export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    const {id} = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AccessError(400, 'Invalid task.');
    const task = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (task.error) throw new AccessError(503, 'Unable to load this task.');
    if (!task.data) throw new AccessError(404, 'Task not found.');
    const [comments, collaborators, reviews, activity, assignments, websites] = await Promise.all([
      supabase.from('task_comments').select('id,author_id,body,created_at').eq('task_id', id).order('created_at'),
      supabase.from('task_collaborators').select('user_id').eq('task_id', id),
      supabase
        .from('task_reviews')
        .select('id,reviewer_id,decision,feedback,created_at')
        .eq('task_id', id)
        .order('created_at', {ascending: false}),
      supabase
        .from('audit_events')
        .select('id,actor_id,action,safe_metadata,created_at')
        .eq('entity_type', 'task')
        .eq('entity_id', id)
        .eq('workspace_id', profile.workspace_id)
        .order('created_at', {ascending: false})
        .limit(100),
      supabase
        .from('assignment_requests')
        .select('id,recipient_id,state,reason,created_at')
        .eq('task_id', id)
        .order('created_at', {ascending: false}),
      supabase.from('task_websites').select('website_id').eq('task_id', id).eq('workspace_id', profile.workspace_id),
    ]);
    if ([comments, collaborators, reviews, activity, assignments, websites].some(r => r.error))
      throw new AccessError(503, 'Task collaboration needs the new task-workflows-and-team database migration.');
    return Response.json(
      {
        task: task.data,
        comments: comments.data,
        collaborators: collaborators.data,
        reviews: reviews.data,
        activity: activity.data,
        assignments: assignments.data,
        website_ids: websites.data?.map(w => w.website_id),
      },
      {headers: {'Cache-Control': 'private, no-store'}},
    );
  } catch (error) {
    return mutationFailure(error);
  }
}
