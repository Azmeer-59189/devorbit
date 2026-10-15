import {AccessError,requireWorkspaceUser} from '@/lib/live-auth';

export async function GET(request:Request){
  try{
    const {supabase,user,profile}=await requireWorkspaceUser(request);
    const [workspace,websites,tasks,members,assignments,taskWebsites]=await Promise.all([
      supabase.from('workspaces').select('id,name,timezone').eq('id',profile.workspace_id).single(),
      supabase.from('websites').select('id,name,country,canonical_url,cms,status,archived_at').eq('workspace_id',profile.workspace_id).order('name').limit(100),
      supabase.from('tasks').select('id,title,description,category,priority,progress,assignee_id,creator_id,due_date,review_required,reviewer_id,created_at,revision,blocker_reason,completed_at').eq('workspace_id',profile.workspace_id).is('archived_at',null).order('created_at',{ascending:false}).limit(100),
      supabase.from('profiles').select('id,display_name,role,active').eq('workspace_id',profile.workspace_id).order('display_name'),
      supabase.from('assignment_requests').select('id,task_id,recipient_id,state').eq('workspace_id',profile.workspace_id).eq('state','pending'),
      supabase.from('task_websites').select('task_id,website_id').eq('workspace_id',profile.workspace_id),
    ]);
    if(workspace.error||websites.error||tasks.error||members.error||assignments.error||taskWebsites.error)throw new AccessError(503,'Unable to load workspace records. Verify the database migration and access policies.');
    return Response.json({profile:{...profile,email:user.email},workspace:workspace.data,websites:websites.data,tasks:tasks.data,members:members.data,assignments:assignments.data,taskWebsites:taskWebsites.data},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    const known=error instanceof AccessError;
    return Response.json({error:known?error.message:'An unexpected error occurred. Please try again.'},{status:known?error.status:500,headers:{'Cache-Control':'no-store'}});
  }
}
