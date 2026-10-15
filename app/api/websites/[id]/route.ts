import {requireWorkspaceUser,AccessError} from '@/lib/live-auth';
import {mutationFailure,rpcFailure} from '@/lib/live-mutations';
import {recordId} from '@/lib/reporting';
import {websiteManagementInput} from '@/lib/website-management';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){try{
 const id=recordId((await params).id)!;const {supabase,profile}=await requireWorkspaceUser(request);
 const site=await supabase.from('websites').select('*').eq('workspace_id',profile.workspace_id).eq('id',id).maybeSingle();
 if(site.error)throw new AccessError(503,'Unable to load this website.');if(!site.data)throw new AccessError(404,'Website not found.');
 const [tasks,reports]=await Promise.all([
 supabase.from('task_websites').select('tasks(*)').eq('workspace_id',profile.workspace_id).eq('website_id',id).limit(100),
 supabase.from('report_submissions').select('*,form_template_versions!report_submissions_workspace_id_template_version_id_fkey(title,version_number)').eq('workspace_id',profile.workspace_id).eq('website_id',id).order('period_start',{ascending:false}).limit(100)]);
 return Response.json({website:site.data,tasks:tasks.data?.map(x=>x.tasks)||[],reports:reports.data||[],relatedErrors:[tasks.error?'Tasks unavailable.':'',reports.error?'Reports unavailable. Apply migration 005 if needed.':''].filter(Boolean)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return mutationFailure(error)}}
export async function PATCH(request:Request,{params}:Context){try{
 const {supabase}=await requireWorkspaceUser(request);const id=recordId((await params).id);const input=websiteManagementInput(await request.json());if(input.website_id!==id)throw new AccessError(400,'Website identity does not match.');
 const {data,error}=await supabase.rpc('manage_workspace_website',{p_input:input});if(error){if(error.code==='40001')throw new AccessError(409,'This website changed. Your form is kept; reload the latest version before saving.');throw rpcFailure(error)}return Response.json({id:data});
 }catch(error){return mutationFailure(error)}}