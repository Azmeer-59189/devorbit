import {createBrowserSupabase} from '@/lib/supabase';
export async function workspaceFetch(path:string,options:RequestInit={}){
 const {data:{session}}=await createBrowserSupabase().auth.getSession();
 if(!session)throw new Error('No saved session was found. Please sign in again.');
 const headers=new Headers(options.headers);headers.set('Authorization',`Bearer ${session.access_token}`);
 const response=await fetch(path,{...options,headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Unable to complete this request. Please retry.');
 return data;
}
