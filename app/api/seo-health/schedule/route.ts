import {requireWorkspaceUser} from '@/lib/live-auth';
import {readJson} from '@/lib/live-validation';
import {mutationFailure, rpcFailure} from '@/lib/live-mutations';
import {auditScheduleInput} from '@/lib/seo-health';
export async function POST(request: Request) {
  try {
    const {supabase} = await requireWorkspaceUser(request);
    const input = auditScheduleInput(await readJson(request, 1000));
    const {data, error} = await supabase.rpc('set_audit_schedule', {p_input: input});
    if (error) throw rpcFailure(error);
    return Response.json({interval_days: data}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
