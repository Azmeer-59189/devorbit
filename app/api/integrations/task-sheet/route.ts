import {createClient} from '@supabase/supabase-js';
import {AccessError, requireWorkspaceUser} from '@/lib/live-auth';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {readJson} from '@/lib/live-validation';
import {taskSheetRows, validSheetSecret} from '@/lib/task-sheet';

export async function GET(request: Request) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    const sheet = process.env.TASK_SHEET_ID;
    if (!sheet || process.env.TASK_SHEET_WORKSPACE_ID !== profile.workspace_id)
      return Response.json({connected: false}, {headers: {'Cache-Control': 'no-store'}});
    const {data, error} = await supabase
      .from('task_sheet_sync_state')
      .select('last_synced_at')
      .eq('workspace_id', profile.workspace_id)
      .eq('sheet_id', sheet)
      .maybeSingle();
    return Response.json(
      {
        connected: true,
        url: `https://docs.google.com/spreadsheets/d/${sheet}/edit`,
        last_synced_at: data?.last_synced_at ?? null,
        setup_pending: !!error,
      },
      {headers: {'Cache-Control': 'no-store'}},
    );
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const secret = process.env.TASK_SHEET_SYNC_SECRET;
    const sheet = process.env.TASK_SHEET_ID;
    const workspace = process.env.TASK_SHEET_WORKSPACE_ID;
    const actor = process.env.TASK_SHEET_ACTOR_ID;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!secret || !sheet || !workspace || !actor || !url || !key)
      throw new AccessError(503, 'Task sheet sync has not been configured on the server.');
    if (!validSheetSecret(request.headers.get('authorization'), secret))
      throw new AccessError(401, 'Invalid sheet sync key.');
    const input = await readJson(request, 1_000_000);
    const rows = taskSheetRows(input, sheet);
    const server = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
    const {data, error} = await server.rpc('sync_task_sheet', {
      p_workspace: workspace,
      p_actor: actor,
      p_sheet: sheet,
      p_rows: rows,
    });
    if (error) throw rpcFailure(error);
    return Response.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
