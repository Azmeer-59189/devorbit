import {AccessError, requireWorkspaceUser} from '@/lib/live-auth';
import {InputError, readJson} from '@/lib/live-validation';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
export async function GET(request: Request) {
  try {
    const {supabase, user} = await requireWorkspaceUser(request);
    const unreadQuery = supabase
      .from('notifications')
      .select('id', {count: 'exact', head: true})
      .eq('recipient_id', user.id)
      .is('read_at', null);
    // The header badge polls for the count alone, so it skips loading the list.
    if (new URL(request.url).searchParams.get('count') === 'unread') {
      const unread = await unreadQuery;
      if (unread.error) throw new AccessError(503, 'Unable to count unread notifications.');
      return Response.json({unread: unread.count || 0}, {headers: {'Cache-Control': 'private, no-store'}});
    }
    const [list, unread] = await Promise.all([
      supabase
        .from('notifications')
        .select('id,task_id,kind,title,read_at,created_at')
        .eq('recipient_id', user.id)
        .order('created_at', {ascending: false})
        .limit(100),
      unreadQuery,
    ]);
    if (list.error) throw new AccessError(503, 'Notifications need the new task-workflows-and-team migration.');
    if (unread.error) throw new AccessError(503, 'Unable to count unread notifications.');
    return Response.json(
      {notifications: list.data, unread: unread.count || 0},
      {headers: {'Cache-Control': 'private, no-store'}},
    );
  } catch (error) {
    return mutationFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const {id} = await readJson(request);
    if (id !== null && (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)))
      throw new InputError('Invalid notification.');
    const {error} = await supabase.rpc('mark_workspace_notifications', {p_id: id});
    if (error) throw rpcFailure(error);
    return Response.json({ok: true}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
