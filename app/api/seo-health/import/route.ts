import {requireWorkspaceUser, AccessError} from '@/lib/live-auth';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {prepareSeoImport} from '@/lib/seo-import';
export async function GET(request: Request) {
  try {
    const {profile, supabase} = await requireWorkspaceUser(request);
    if (profile.role !== 'administrator') throw new AccessError(403, 'Administrator required.');
    const {data: catalog, error} = await supabase.rpc('fixed_seo_catalog', {p_site: null});
    if (error) throw rpcFailure(error);
    const existing = catalog.websites as {
      canonical_url: string;
      name: string;
      cms: string;
      revision: number;
      archived_at: string | null;
      status: string;
    }[];
    return Response.json(
      {
        rows: prepareSeoImport().map(row => {
          const match = existing.find(w => w.canonical_url === row.url);
          return {
            ...row,
            review: !match
              ? 'Create missing website and import SEO form'
              : match.archived_at || match.status === 'archived'
                ? 'Skip archived website'
                : match.revision > 0
                  ? 'Keep existing SEO form; add only missing audit dates'
                  : `Match existing website: ${match.name} (${match.cms || 'CMS unspecified'}). Keep registry details.`,
          };
        }),
        notice:
          '14 websites, 33 fields, 27 audits. Existing registry details and existing SEO profiles will not be overwritten. Conflicting audit scores are skipped. Source notes may contradict structured fields; both are retained. Dashes are unknown. Plugin/backup dates use underlying Sheets dates. Page-speed measurement date/method is unknown. This is a saved snapshot, not a live Google Sheets sync.',
      },
      {headers: {'Cache-Control': 'no-store'}},
    );
  } catch (error) {
    return mutationFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    if (profile.role !== 'administrator') throw new AccessError(403, 'Administrator required.');
    const input = await request.json();
    if (input.confirm !== true) throw new AccessError(400, 'Review the import preview and confirm first.');
    const {data, error} = await supabase.rpc('import_fixed_seo', {p_rows: prepareSeoImport()});
    if (error) throw rpcFailure(error);
    return Response.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
