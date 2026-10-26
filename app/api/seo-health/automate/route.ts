import {createClient} from '@supabase/supabase-js';
import {AccessError, requireWorkspaceUser} from '@/lib/live-auth';
import {readJson} from '@/lib/live-validation';
import {recordId} from '@/lib/reporting';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {publicAuditUrl, runPageSpeed} from '@/lib/pagespeed';

export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const input = await readJson(request, 2000);
    const website = recordId(input.website_id)!;
    const requestId = recordId(input.request_id)!;
    const key = process.env.PAGESPEED_API_KEY;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!key || !secret)
      throw new AccessError(503, 'Automatic audits need the server-only PAGESPEED_API_KEY and SUPABASE_SECRET_KEY.');
    const {data: started, error} = await supabase.rpc('start_website_lighthouse', {
      p_site: website,
      p_request: requestId,
    });
    if (error) throw rpcFailure(error);
    if (!started.started)
      return Response.json({state: started.state, id: started.id}, {headers: {'Cache-Control': 'no-store'}});
    const server = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
    try {
      const result = await runPageSpeed(publicAuditUrl(started.requested_url), key);
      const finished = await server.rpc('finish_website_lighthouse', {p_run: started.id, p_result: result});
      if (finished.error)
        throw new AccessError(503, 'Google completed the audit, but saving failed. Reload before retrying.');
      const {data: saved, error: readError} = await supabase
        .from('website_lighthouse_runs')
        .select('state')
        .eq('id', started.id)
        .single();
      if (readError || saved?.state !== 'completed')
        throw new AccessError(409, 'Website or membership changed during the audit. Previous results were kept.');
      return Response.json({state: 'completed', id: started.id}, {headers: {'Cache-Control': 'no-store'}});
    } catch (error) {
      await server.rpc('finish_website_lighthouse', {p_run: started.id, p_result: {error_code: 'provider_failed'}});
      throw error;
    }
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function GET(request: Request) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    const website = recordId(new URL(request.url).searchParams.get('website'))!;
    const {data, error} = await supabase
      .from('website_lighthouse_runs')
      .select(
        'id,state,created_at,finished_at,measured_at,seo_score,performance_score,lcp_seconds,speed_index_seconds,lighthouse_version,final_url,error_code',
      )
      .eq('workspace_id', profile.workspace_id)
      .eq('website_id', website)
      .order('created_at', {ascending: false})
      .limit(20);
    if (error) throw rpcFailure(error);
    return Response.json({runs: data}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
