import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AccessError,authVerificationError,requireWorkspaceUser} from '../lib/live-auth';

test('Supabase connectivity failures are unavailable responses, not rejected sessions',()=>{
 for(const error of [{name:'AuthRetryableFetchError',status:0},{status:503},{status:500}]){
  const result=authVerificationError(error);
  assert.equal(result.status,503);
  assert.match(result.message,/cannot reach Supabase/);
 }
 assert.equal(authVerificationError({status:429}).status,429);
 assert.equal(authVerificationError({name:'AuthApiError',status:403}).status,401);
});

test('live workspace rejects requests without a bearer token before database access',async()=>{
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const oldKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.example.org';
 process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-public-key';
 try{
  const cases:HeadersInit[]=[{},{Authorization:'Basic invalid'},{Authorization:'Bearer '}];
  for(const headers of cases){
   await assert.rejects(requireWorkspaceUser(new Request('http://localhost/api/workspace',{headers})),error=>error instanceof AccessError&&error.status===401);
  }
 }finally{
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=oldKey;
 }
});
