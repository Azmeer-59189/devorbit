import {createClient} from '@supabase/supabase-js';

export class AccessError extends Error {
  constructor(public status:number,message:string){super(message)}
}

export function authVerificationError(error:{name?:string;status?:number}){
  if(error.name==='AuthRetryableFetchError'||error.status===0||(error.status??0)>=500){
    return new AccessError(503,'The server cannot reach Supabase to verify your session. Check the server network connection and try again.');
  }
  if(error.status===429)return new AccessError(429,'Supabase is receiving too many requests. Wait a moment and try again.');
  return new AccessError(401,'Your session has expired or is invalid. Please sign in again.');
}

export async function requireAuthenticatedUser(request:Request){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new AccessError(503,'Supabase is not configured.');
  const authorization=request.headers.get('authorization');
  if(!authorization?.startsWith('Bearer ')||authorization.length<9)throw new AccessError(401,'Sign in to access your workspace.');
  const token=authorization.slice(7);
  const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:{user},error:authError}=await supabase.auth.getUser(token);
  if(authError)throw authVerificationError(authError);
  if(!user)throw new AccessError(401,'Your session has expired or is invalid. Please sign in again.');
  return {supabase,user};
}
export async function requireWorkspaceUser(request:Request){
  const {supabase,user}=await requireAuthenticatedUser(request);
  const {data:profile,error}=await supabase.from('profiles').select('id,workspace_id,display_name,role,active').eq('id',user.id).maybeSingle();
  if(error){if(['PGRST205','42P01'].includes(error.code))throw new AccessError(503,'Database setup is required. Apply the DevOrbit foundation migration.');throw new AccessError(503,'Unable to verify workspace membership. Please try again.');}
  if(!profile?.active)throw new AccessError(403,'Your account does not have an active DevOrbit workspace membership. Contact your administrator.');
  return {supabase,user,profile};
}
