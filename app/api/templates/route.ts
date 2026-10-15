import {requireWorkspaceUser,AccessError} from '@/lib/live-auth';
import {mutationFailure} from '@/lib/live-mutations';
import {templateInput} from '@/lib/reporting';
import {reportingError} from '@/lib/reporting-server';
export async function GET(request:Request){try{
 const {supabase,profile}=await requireWorkspaceUser(request);
 const admin=profile.role==='administrator';
 const results=await Promise.all([supabase.from('form_templates').select('*').eq('workspace_id',profile.workspace_id).in('state',admin?['draft','published','archived']:['published']),supabase.from('form_template_versions').select('*').eq('workspace_id',profile.workspace_id).order('version_number',{ascending:false}),supabase.from('form_template_websites').select('template_id,website_id').eq('workspace_id',profile.workspace_id)]);
 for(const result of results)if(result.error)throw reportingError(result.error);
 return Response.json({templates:results[0].data,versions:results[1].data,assignments:results[2].data},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return mutationFailure(error)}}
export async function POST(request:Request){try{const {supabase,profile}=await requireWorkspaceUser(request);if(profile.role!=='administrator')throw new AccessError(403,'Only administrators can manage templates.');const input=templateInput(await request.json());const {data,error}=await supabase.rpc('manage_reporting_template',{p_input:input});if(error)throw reportingError(error);return Response.json({id:data});}catch(error){return mutationFailure(error)}}
