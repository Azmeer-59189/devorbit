type AuthFailure={code?:string;status?:number;name?:string};

// Use stable Supabase error codes; never display raw provider messages or tokens.
export function signInFeedback(error:AuthFailure){
 switch(error.code){
  case 'email_not_confirmed':return 'Your email is not confirmed. Confirm your account before signing in.';
  case 'invalid_credentials':return 'The email or password was not accepted. Use your DevOrbit application account, not your Supabase dashboard password.';
  case 'user_banned':return 'This account is disabled. Contact your workspace administrator.';
  case 'over_request_rate_limit':case 'over_email_send_rate_limit':return 'Too many attempts. Wait a few minutes before trying again.';
 }
 if(error.status===429)return 'Too many attempts. Wait a few minutes before trying again.';
 if(error.name==='AuthRetryableFetchError')return 'Unable to reach Supabase. Check your connection and try again.';
 return 'Sign-in failed. Check your account details and try again.';
}

export async function verifyWorkspaceSession(token:string,request:typeof fetch=fetch){
 const response=await request('/api/workspace',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
 let body:{error?:string}={};
 try{body=await response.json()}catch{/* A proxy or server may return a non-JSON error. */}
 if(response.status===401)throw new Error('Supabase signed you in, but the server rejected the session. Reload this page and try again. If it continues, the browser and server Supabase configuration need checking.');
 if(!response.ok)throw new Error(body.error||'Sign-in succeeded, but your workspace could not be opened. Please retry.');
}
