import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signInFeedback,verifyWorkspaceSession} from '../lib/auth-feedback';

test('sign-in errors distinguish confirmation, credentials and rate limiting',()=>{
 assert.match(signInFeedback({code:'email_not_confirmed'}),/not confirmed/);
 assert.match(signInFeedback({code:'invalid_credentials'}),/application account/);
 assert.match(signInFeedback({status:429}),/Too many/);
});
test('workspace session check preserves membership failure instead of navigating into a login loop',async()=>{
 const request=(async()=>Response.json({error:'Your account does not have an active DevOrbit workspace membership.'},{status:403})) as typeof fetch;
 await assert.rejects(verifyWorkspaceSession('test-token',request),/active DevOrbit workspace membership/);
});
test('workspace session check distinguishes rejected JWT and permits verified access',async()=>{
 await assert.rejects(verifyWorkspaceSession('test-token',(async()=>Response.json({},{status:401})) as typeof fetch),/server rejected the session/);
 await verifyWorkspaceSession('test-token',(async(_input,init)=>{assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test-token');return Response.json({workspace:{}})}) as typeof fetch);
});
test('server connectivity failure is shown as connectivity rather than credential rejection',async()=>{
 const message='The server cannot reach Supabase to verify your session.';
 await assert.rejects(verifyWorkspaceSession('test-token',(async()=>Response.json({error:message},{status:503})) as typeof fetch),error=>error instanceof Error&&error.message===message);
});
