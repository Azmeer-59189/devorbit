import {test} from 'node:test';
import assert from 'node:assert/strict';
import {websiteManagementInput} from '../lib/website-management';
test('website edits normalize URLs and restrict configuration and status',()=>{
 const input={request_id:crypto.randomUUID(),website_id:crypto.randomUUID(),expected_revision:1,action:'save',name:'Site',country:'UK',cms:'WordPress',url:'https://EXAMPLE.org/',status:'active',configuration:{hosting:'Provider'}};
 assert.equal((websiteManagementInput(input) as {url:string}).url,'https://example.org');
 assert.throws(()=>websiteManagementInput({...input,status:'archived'}));
 assert.throws(()=>websiteManagementInput({...input,expected_revision:0}));
 assert.throws(()=>websiteManagementInput({...input,configuration:{api_key:'value'}}));
 assert.throws(()=>websiteManagementInput({...input,url:'https://user:pass@example.org'}));
 assert.equal(websiteManagementInput({...input,action:'archive'}).action,'archive');
});
