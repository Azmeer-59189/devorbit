import {requireWorkspaceUser, AccessError} from '@/lib/live-auth';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {seoInput} from '@/lib/seo-health';
import {recordId} from '@/lib/reporting';
export async function GET(request: Request) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const website = recordId(new URL(request.url).searchParams.get('website'), false);
    const {data, error} = await supabase.rpc('fixed_seo_catalog', {p_site: website});
    if (error) throw rpcFailure(error);
    return Response.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const input = seoInput(await request.json());
    const {data, error} = await supabase.rpc('save_fixed_seo', {p_input: input});
    if (error) {
      if (error.code === '40001')
        throw new AccessError(409, 'This SEO form changed. Your draft is kept. Reload before saving.');
      if (error.message?.includes('requires a reason'))
        throw new AccessError(400, 'Correcting an existing dated score requires a reason.');
      throw rpcFailure(error);
    }
    return Response.json({id: data});
  } catch (error) {
    return mutationFailure(error);
  }
}
