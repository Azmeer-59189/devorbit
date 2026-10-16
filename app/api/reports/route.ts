import {requireWorkspaceUser} from '@/lib/live-auth';
import {readJson} from '@/lib/live-validation';
import {mutationFailure} from '@/lib/live-mutations';
import {reportInput, validateAnswers} from '@/lib/reporting';
import {reportingError} from '@/lib/reporting-server';
export async function GET(request: Request) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    const {data, error} = await supabase
      .from('report_submissions')
      .select(
        '*,report_revisions!report_revisions_workspace_id_submission_id_fkey(*),form_template_versions!report_submissions_workspace_id_template_version_id_fkey(*)',
      )
      .eq('workspace_id', profile.workspace_id)
      .order('period_start', {ascending: false})
      .limit(100);
    if (error) throw reportingError(error);
    return Response.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return mutationFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const {supabase, profile} = await requireWorkspaceUser(request);
    const input = reportInput(await readJson(request));
    const {data: version, error: versionError} = await supabase
      .from('form_template_versions')
      .select('fields')
      .eq('workspace_id', profile.workspace_id)
      .eq('id', input.template_version_id)
      .single();
    if (versionError) throw reportingError(versionError);
    validateAnswers(version.fields, input.answers);
    const {data, error} = await supabase.rpc('submit_workspace_report', {p_input: input});
    if (error) throw reportingError(error);
    return Response.json({id: data});
  } catch (error) {
    return mutationFailure(error);
  }
}
