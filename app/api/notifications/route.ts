import {AccessError,requireWorkspaceUser} from '@/lib/live-auth';
import {InputError} from '@/lib/live-validation';
import {mutationFailure,rpcFailure} from '@/lib/live-mutations';
export async function GET(request:Request){
 try{const {supabase,user}=await requireWorkspaceUser(request);const {data,error}=await supabase.from('notifications').select('id,task_id,kind,title,read_at,created_at').eq('recipient_id',user.id).order('created_at',{ascending:false}).limit(100);if(error)throw new AccessError(503,'Notifications need the new task-workflows-and-team migration.');return Response.json({notifications:data},{headers:{'Cache-Control':'private, no-store'}})}catch(error){return mutationFailure(error)}
}
export async function POST(request:Request){
 try{const {supabase}=await requireWorkspaceUser(request);const {id}=await request.json();if(id!==null&&(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))throw new InputError('Invalid notification.');const {error}=await supabase.rpc('mark_workspace_notifications',{p_id:id});if(error)throw rpcFailure(error);return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}})}catch(error){return mutationFailure(error)}
}
