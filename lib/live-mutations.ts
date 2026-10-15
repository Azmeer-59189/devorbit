import {AccessError,requireWorkspaceUser} from '@/lib/live-auth';
import {InputError,taskInput,websiteInput} from '@/lib/live-validation';

export function mutationFailure(error:unknown){
 if(error instanceof InputError)return Response.json({error:error.message},{status:400,headers:{'Cache-Control':'no-store'}});
 if(error instanceof AccessError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
 return Response.json({error:'Unable to save this record. Please try again.'},{status:500,headers:{'Cache-Control':'no-store'}});
}
export function rpcFailure(error:{code?:string;message?:string}){
 if(['PGRST202','42883'].includes(error.code||''))return new AccessError(503,'This feature is not enabled in the database yet. Ask your administrator to apply the latest workspace migration, then retry.');
 if(error.code==='42501')return new AccessError(403,'You do not have permission to perform this action.');
 if(error.code==='40001')return new AccessError(409,'This task changed. Refresh it before saving. Your draft has been kept.');
 if(error.code==='54000')return new AccessError(429,'Too many team changes. Wait a minute and retry.');
 if(error.code==='P0001'&&['Create this user in Supabase Authentication first, then add their email here.','This account already has a workspace profile. Existing memberships are not moved or overwritten.','You cannot remove your own administrator access.','Keep at least one active administrator.','A blocker reason is required.','Reopening requires a reason and To Do or In Progress status.','Use a review decision for a task awaiting review.','An independent reviewer must approve this task.','Accept an assignment before updating progress.','Reopen this task before assigning it.','Explain the changes you need.','Choose a different assignee.','This task does not require review.','Choose an active independent reviewer.','No pending assignment request exists.'].includes(error.message||''))return new AccessError(400,error.message!);
 if(error.code==='23505')return new AccessError(409,'This website already exists. Use its existing profile.');
 if(error.code==='P0001'){
  const allowed=['Only administrators and managers can add websites.','Select active members from your workspace.','Select active websites from your workspace.','Choose an independent reviewer.','This request was already used for another action.','A decline reason is required.','This assignment request has already been answered.','Only the recipient can respond to this assignment.'];
  if(allowed.includes(error.message||''))return new AccessError(400,error.message!);
 }
 if(['22023','22P02','22007','22008','23514','P0001'].includes(error.code||''))return new AccessError(400,'Some fields are invalid. Check the form and try again.');
 return new AccessError(503,'The database could not save this record. Please retry.');
}
export async function createRecord(request:Request,kind:'website'|'task'){
 try{
  const {supabase,profile}=await requireWorkspaceUser(request);
  if(kind==='website'&&!['administrator','manager'].includes(profile.role))throw new AccessError(403,'Only administrators and managers can add websites.');
  if(Number(request.headers.get('content-length')||0)>24000)throw new InputError('The submitted form is too large.');
  let input;try{input=await request.json()}catch{throw new InputError('Enter valid form data.')}
  const values=kind==='website'?websiteInput(input):taskInput(input);
  const {data,error}=await supabase.rpc(kind==='website'?'create_workspace_website':'create_workspace_task',{p_input:values});
  if(error)throw rpcFailure(error);
  return Response.json({id:data},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(error){return mutationFailure(error)}
}
