import {requireWorkspaceUser} from '@/lib/live-auth';
import {InputError,assignmentInput} from '@/lib/live-validation';
import {mutationFailure,rpcFailure} from '@/lib/live-mutations';
export async function POST(request:Request){
 try{
  const {supabase}=await requireWorkspaceUser(request);
  const input=assignmentInput(await request.json());
  const {data,error}=await supabase.rpc('respond_workspace_assignment',{p_request_id:input.request_id,p_accept:input.accept,p_reason:input.reason.trim()});
  if(error)throw rpcFailure(error);
  return Response.json({id:data},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof SyntaxError)return mutationFailure(new InputError('Invalid assignment response.'));return mutationFailure(error)}
}
