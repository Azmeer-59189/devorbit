'use client';

import {FormEvent,useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowRight,LoaderCircle,ShieldCheck} from 'lucide-react';
import {createBrowserSupabase} from '@/lib/supabase';
import {signInFeedback,verifyWorkspaceSession} from '@/lib/auth-feedback';

export function Login(){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function signIn(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');
  const form=new FormData(event.currentTarget);
  try{
   const client=createBrowserSupabase();
   const {data,error}=await client.auth.signInWithPassword({email:String(form.get('email')).trim(),password:String(form.get('password'))});
   if(error){setError(signInFeedback(error));return}
   if(!data.session){setError('Sign-in did not produce a session. Please try again.');return}
   try{await verifyWorkspaceSession(data.session.access_token)}catch(error){setError(error instanceof Error?error.message:'Unable to verify workspace access.');return}
   router.replace('/workspace');
  }catch{setError('Unable to connect to Supabase. Check your connection and application configuration.')}finally{setBusy(false)}
 }
 return <div className="auth-shell"><section className="auth-story"><Link href="/" className="brand"><Image src="/logo.svg" width={42} height={42} alt="DevOrbit" unoptimized/><span>DevOrbit.</span></Link><div><span className="eyebrow">ONE TEAM. ONE SHARED ORBIT.</span><h1>Good work starts<br/>with a clear view.</h1><p>Your people, websites, and daily work.<br/>Connected in one thoughtful workspace.</p><div className="auth-orbit" aria-hidden="true"><div/><i/><span>✦</span></div></div><span className="auth-story-footer">Built for the International Desk</span></section><section className="auth-form-area"><div className="auth-form"><span className="eyebrow">WELCOME TO DEVORBIT</span><h1>Back in your orbit.</h1><p>Sign in with your invited team account.</p><form onSubmit={signIn}><label className="field">Email address<input autoFocus type="email" autoComplete="username" name="email" required placeholder="you@organization.org"/></label><label className="field">Password<input type="password" autoComplete="current-password" name="password" required placeholder="Your password"/></label>{error&&<div role="alert" className="form-error">{error}</div>}<button className="button primary" disabled={busy} type="submit">{busy?<LoaderCircle className="spin" size={16}/>:<>Sign in <ArrowRight size={16}/></>}</button></form><div className="auth-note"><ShieldCheck size={17}/><p>DevOrbit is an invitation-only workspace.<br/>Need access? Contact your administrator.</p></div></div></section></div>
}

export {default as LiveWorkspace} from './connected-workspace';
