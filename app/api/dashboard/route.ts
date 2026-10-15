import {requireWorkspaceUser, AccessError} from '@/lib/live-auth';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {dateRangeFilters} from '@/lib/dates';
export async function GET(request: Request) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const params = new URL(request.url).searchParams;
    const filters = dateRangeFilters(params);
    const source = params.get('source') || '';
    if (source.length > 500) throw new AccessError(400, 'Invalid SEO source.');
    const {data, error} = await supabase.rpc('workspace_dashboard', {p_filters: {...filters, source}});
    if (error) throw rpcFailure(error);
    return Response.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
