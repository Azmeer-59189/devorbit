import {loadEnvFile} from 'node:process';
import {existsSync} from 'node:fs';

// Match Next's precedence; process values always win. Never print configuration.
for(const file of ['.env.development.local','.env.local','.env.development','.env']){
 if(existsSync(file))loadEnvFile(file);
}
async function main(){
 const raw=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!raw||!key)throw new Error('Missing required Supabase configuration.');
 let url;
 try{url=new URL(raw)}catch{throw new Error('The Supabase project URL is invalid.')}
 if(url.protocol!=='https:')throw new Error('The Supabase project URL must use HTTPS.');
 for(const [check,path] of [['auth','/auth/v1/settings'],['schema','/rest/v1/workspaces?select=id&limit=0']]){
  let response;
  try{response=await fetch(url.origin+path,{headers:{apikey:key},signal:AbortSignal.timeout(15000)})}catch{throw new Error('Supabase is unreachable. Check your network and project status.')}
  let result={};try{result=await response.json()}catch{}
  if(check==='auth'){
   if(!response.ok)throw new Error(`Auth verification failed (HTTP ${response.status}). Check your publishable key.`);
   console.log('Supabase Auth: connected');
   console.log('Email authentication: '+(result.external?.email?'enabled':'disabled'));
   console.log('Public sign-up: '+(result.disable_signup?'disabled':'ENABLED — disable for invitation-only onboarding'));
  }else if(response.status===404&&result.code==='PGRST205'){
   console.log('DevOrbit database foundation: not applied');
  }else if(response.ok){console.log('DevOrbit database foundation: workspace endpoint available (not a complete schema/RLS audit)')}
  else{console.log(`DevOrbit database check: HTTP ${response.status}; requires further verification`)}
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
