import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seoFields} from '../lib/reporting';
import {PGlite} from '@electric-sql/pglite';

// Real PostgreSQL engine, isolated in memory. No production credentials or records.
test('transactional creation and assignment RPCs enforce roles, workspace isolation and audit',async t=>{
 const db=new PGlite();
 const admin='00000000-0000-4000-8000-000000000001';
 const developer='00000000-0000-4000-8000-000000000002';
 const outsider='00000000-0000-4000-8000-000000000003';
 const inactive='00000000-0000-4000-8000-000000000004';
 const workspaceA='10000000-0000-4000-8000-000000000001';
 const workspaceB='10000000-0000-4000-8000-000000000002';
 const request=()=>crypto.randomUUID();
 async function asUser(id:string){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`)}
 async function rpc(name:string,value:unknown){return (await db.query<{id:string}>(`select public.${name}($1::jsonb) as id`,[JSON.stringify(value)])).rows[0].id}
 async function count(table:string){return Number((await db.query<{n:number}>(`select count(*) as n from public.${table}`)).rows[0].n)}
 let siteA='',siteB='';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  // gen_random_uuid is built into PostgreSQL. The pgcrypto extension is not
  // needed by these migrations and is unavailable in this embedded runtime.
  const foundation=(await readFile('supabase/migrations/202610150001_foundation.sql','utf8')).replace('create extension if not exists pgcrypto;','');
  await db.exec(foundation);
  await db.exec(await readFile('supabase/migrations/202610150002_live_creation.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/202610150003_task_workflows_and_team.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/202610150004_work_logs_and_timesheets.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/202610150005_forms_and_reporting.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/202610150006_website_management.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/202610150007_task_management.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/202610150008_team_invitations.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/202610150009_dashboard_analytics.sql','utf8'));
  await db.exec(`grant usage on schema public to authenticated,anon;grant select on all tables in schema public to authenticated;
   insert into auth.users(id) values('${admin}'),('${developer}'),('${outsider}'),('${inactive}');
   insert into public.workspaces(id,name) values('${workspaceA}','A'),('${workspaceB}','B');
   insert into public.profiles(id,workspace_id,display_name,role,active) values
    ('${admin}','${workspaceA}','Admin A','administrator',true),
    ('${developer}','${workspaceA}','Developer A','developer',true),
    ('${outsider}','${workspaceB}','Admin B','administrator',true),
    ('${inactive}','${workspaceA}','Inactive','developer',false);`);
  await t.test('website creation is audited, canonicalized and retry-safe',async()=>{
   await asUser(admin);
   const value={request_id:request(),name:'Website A',country:'UK',url:'https://EXAMPLE.org/',cms:'WordPress'};
   siteA=await rpc('create_workspace_website',value);
   assert.equal(await rpc('create_workspace_website',value),siteA);
   assert.equal(await count('websites'),1);
   assert.equal(await count('audit_events'),1);
   assert.equal((await db.query<{url:string}>('select canonical_url as url from public.websites')).rows[0].url,'https://example.org');
   await assert.rejects(rpc('create_workspace_website',{...value,request_id:request()}),/unique/i);
  });
  await t.test('developers cannot create websites and inactive profiles cannot create tasks',async()=>{
   await asUser(developer);
   await assert.rejects(rpc('create_workspace_website',{request_id:request(),name:'No',country:'UK',url:'https://blocked.example.org'}),/administrators and managers/);
   await asUser(inactive);
   await assert.rejects(rpc('create_workspace_task',{request_id:request(),title:'No',website_ids:[]}),/Active workspace membership/);
  });
  await t.test('workspace RLS hides other records and direct writes remain denied',async()=>{
   await asUser(outsider);
   assert.equal(await count('websites'),0);
   siteB=await rpc('create_workspace_website',{request_id:request(),name:'Website B',country:'US',url:'https://b.example.org'});
   await asUser(admin);
   assert.equal(await count('websites'),1);
   await assert.rejects(db.exec("insert into public.websites(workspace_id,name,country,canonical_url) values('"+workspaceA+"','Direct','UK','https://direct.example.org')"),/permission denied/i);
  });
  await t.test('self-assignment is accepted; global tasks have one row and distinct website links',async()=>{
   await asUser(developer);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Self-assigned',category:'Development',priority:'medium',assignee_id:developer,website_ids:[siteA,siteA]});
   const result=(await db.query<{assignee_id:string}>('select assignee_id from public.tasks where id=$1',[task])).rows[0];
   assert.equal(result.assignee_id,developer);
   assert.equal(await count('tasks'),1);
   assert.equal(await count('task_websites'),1);
   assert.equal((await db.query<{state:string}>('select state from public.assignment_requests where task_id=$1',[task])).rows[0].state,'accepted');
  });
  await t.test('cross-workspace and inactive associations fail atomically',async()=>{
   await asUser(admin);
   const before=await count('tasks');
   const value={request_id:request(),title:'Cross-workspace',website_ids:[siteB]};
   await assert.rejects(rpc('create_workspace_task',value),/active websites/);
   await assert.rejects(rpc('create_workspace_task',{...value,website_ids:[],assignee_id:outsider}),/active members/);
   await assert.rejects(rpc('create_workspace_task',{...value,website_ids:[],assignee_id:inactive}),/active members/);
   await assert.rejects(rpc('create_workspace_task',{...value,website_ids:[],assignee_id:developer,review_required:true,reviewer_id:developer}),/independent reviewer/);
   assert.equal(await count('tasks'),before);
  });
  await t.test('other-user assignment stays pending and only the recipient can accept',async()=>{
   await asUser(admin);
   const value={request_id:request(),title:'Assigned to developer',assignee_id:developer,website_ids:[siteA]};
   const task=await rpc('create_workspace_task',value);
   assert.equal(await rpc('create_workspace_task',value),task);
   assert.equal((await db.query<{assignee_id:string|null}>('select assignee_id from public.tasks where id=$1',[task])).rows[0].assignee_id,null);
   const assignment=(await db.query<{id:string}>('select id from public.assignment_requests where task_id=$1',[task])).rows[0].id;
   await assert.rejects(db.query('select public.respond_workspace_assignment($1,true,$2)',[assignment,'']),/Only the recipient/);
   await asUser(developer);
   await db.query('select public.respond_workspace_assignment($1,true,$2)',[assignment,'']);
   await db.query('select public.respond_workspace_assignment($1,true,$2)',[assignment,'']);
   assert.equal((await db.query<{assignee_id:string}>('select assignee_id from public.tasks where id=$1',[task])).rows[0].assignee_id,developer);
   assert.equal(Number((await db.query<{n:number}>("select count(*) as n from public.audit_events where entity_id=$1 and action='assignment.accepted'",[task])).rows[0].n),1);
  });
  await t.test('decline requires reason and preserves task plus attempt history',async()=>{
   await asUser(admin);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Decline example',assignee_id:developer,website_ids:[]});
   const assignment=(await db.query<{id:string}>('select id from public.assignment_requests where task_id=$1',[task])).rows[0].id;
   await asUser(developer);
   await assert.rejects(db.query('select public.respond_workspace_assignment($1,false,$2)',[assignment,'']),/decline reason/);
   await db.query('select public.respond_workspace_assignment($1,false,$2)',[assignment,'Capacity is full']);
   const result=(await db.query<{state:string;reason:string}>('select state,reason from public.assignment_requests where id=$1',[assignment])).rows[0];
   assert.equal(result.state,'declined');assert.equal(result.reason,'Capacity is full');
   assert.equal((await db.query('select id from public.tasks where id=$1',[task])).rows.length,1);
  });
  await t.test('caller-supplied identities are ignored, archived links rejected, and invalid requests leave no partial records',async()=>{
   await asUser(admin);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Scoped identity',workspace_id:workspaceB,creator_id:outsider,website_ids:[]});
   const identity=(await db.query<{workspace_id:string;creator_id:string}>('select workspace_id,creator_id from public.tasks where id=$1',[task])).rows[0];
   assert.equal(identity.workspace_id,workspaceA);assert.equal(identity.creator_id,admin);
   const oldSite=await rpc('create_workspace_website',{request_id:request(),name:'Old site',country:'UK',url:'https://old.example.org'});
   await db.exec('reset role');await db.query("update public.websites set archived_at=now(),status='archived' where id=$1",[oldSite]);
   await asUser(admin);
   const beforeTasks=await count('tasks'),beforeAudits=await count('audit_events');
   await assert.rejects(rpc('create_workspace_task',{request_id:request(),title:'Archived link',website_ids:[oldSite]}),/active websites/);
   await assert.rejects(rpc('create_workspace_task',{request_id:request(),title:'Invalid date',due_date:'2026-02-30',website_ids:[siteA]}),/date\/time field value out of range/);
   assert.equal(await count('tasks'),beforeTasks);assert.equal(await count('audit_events'),beforeAudits);
  });
  async function revision(task:string){return (await db.query<{revision:number}>('select revision from public.tasks where id=$1',[task])).rows[0].revision}
  async function action(task:string,operation:string,extra:Record<string,unknown>={}){return rpc('mutate_workspace_task',{request_id:request(),task_id:task,expected_revision:await revision(task),action:operation,...extra})}
  await t.test('blocked states require reason, clearing preserves audit and stale updates conflict',async()=>{
   await asUser(admin);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Workflow test',assignee_id:admin,website_ids:[]});
   await assert.rejects(action(task,'status',{status:'blocked'}),/blocker reason/);
   await action(task,'status',{status:'blocked',reason:'Waiting for design'});
   const stale=await revision(task);
   await action(task,'status',{status:'in_progress'});
   assert.equal((await db.query<{blocker_reason:string|null}>('select blocker_reason from public.tasks where id=$1',[task])).rows[0].blocker_reason,null);
   await assert.rejects(action(task,'status',{status:'completed',expected_revision:stale}),/task changed/);
   const log=(await db.query<{safe_metadata:{before:{blocker_reason:string}}}>("select safe_metadata from public.audit_events where entity_id=$1 and action='task.status' order by created_at desc limit 1",[task])).rows[0];
   assert.equal(log.safe_metadata.before.blocker_reason,'Waiting for design');
  });
  await t.test('collaborators may comment and mention workspace members but cannot complete another owner task',async()=>{
   await asUser(admin);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Collaboration',assignee_id:admin,website_ids:[]});
   await action(task,'collaborator_add',{member_id:developer});
   await assert.rejects(action(task,'collaborator_add',{member_id:outsider}),/active members/);
   await asUser(developer);
   await assert.rejects(action(task,'status',{status:'completed'}),/Only the assignee/);
   await assert.rejects(action(task,'comment',{body:'Cross-workspace mention',mention_ids:[outsider]}),/active members/);
   const input={request_id:request(),task_id:task,expected_revision:await revision(task),action:'comment',body:'Please check this',mention_ids:[admin]};
   await rpc('mutate_workspace_task',input);await rpc('mutate_workspace_task',input);
   assert.equal(Number((await db.query<{n:number}>('select count(*) as n from public.task_comments where task_id=$1',[task])).rows[0].n),1);
   assert.equal((await db.query('select id from public.notifications where task_id=$1',[task])).rows.length,0);
   await asUser(admin);
   assert.equal((await db.query('select id from public.notifications where task_id=$1',[task])).rows.length,1);
   await db.query('select public.mark_workspace_notifications(null)');
   assert.ok((await db.query<{read_at:string}>('select read_at from public.notifications where task_id=$1',[task])).rows[0].read_at);
  });
  await t.test('independent review decisions preserve history, timestamps, and reopening reason',async()=>{
   await asUser(admin);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Review cycle',assignee_id:admin,review_required:true,reviewer_id:developer,website_ids:[]});
   await assert.rejects(action(task,'status',{status:'completed'}),/independent reviewer/);
   await action(task,'status',{status:'in_review'});
   await assert.rejects(action(task,'review_approve'),/independent reviewer/);
   await asUser(developer);
   await assert.rejects(action(task,'review_changes'),/Explain the changes/);
   await action(task,'review_changes',{reason:'Fix mobile layout'});
   await asUser(admin);await action(task,'status',{status:'in_review'});
   await asUser(developer);await action(task,'review_approve',{reason:'Verified mobile fixes'});
   const completed=(await db.query<{completed_at:string;completed_by:string;progress:string}>('select completed_at,completed_by,progress from public.tasks where id=$1',[task])).rows[0];
   assert.equal(completed.progress,'completed');assert.ok(completed.completed_at);assert.equal(completed.completed_by,developer);
   await asUser(admin);
   await assert.rejects(action(task,'status',{status:'in_progress'}),/Reopening requires/);
   await action(task,'status',{status:'in_progress',reason:'New acceptance criteria'});
   assert.equal((await db.query<{completed_at:null}>('select completed_at from public.tasks where id=$1',[task])).rows[0].completed_at,null);
   assert.equal((await db.query('select id from public.task_reviews where task_id=$1',[task])).rows.length,2);
  });
  await t.test('handover retains owner until acceptance and withdrawing preserves request history',async()=>{
   await asUser(admin);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Handover',assignee_id:admin,website_ids:[]});
   await action(task,'status',{status:'blocked',reason:'Waiting for handover'});
   await action(task,'handover',{member_id:developer});
   assert.equal((await db.query<{assignee_id:string}>('select assignee_id from public.tasks where id=$1',[task])).rows[0].assignee_id,admin);
   await action(task,'withdraw');
   assert.equal((await db.query('select id from public.assignment_requests where task_id=$1 and state=$2',[task,'withdrawn'])).rows.length,1);
   await action(task,'handover',{member_id:developer});
   const pending=(await db.query<{id:string}>("select id from public.assignment_requests where task_id=$1 and state='pending'",[task])).rows[0].id;
   await asUser(developer);await db.query('select public.respond_workspace_assignment($1,true,$2)',[pending,'']);
   const updated=(await db.query<{assignee_id:string;blocker_reason:null}>('select assignee_id,blocker_reason from public.tasks where id=$1',[task])).rows[0];
   assert.equal(updated.assignee_id,developer);assert.equal(updated.blocker_reason,null);
  });
  await t.test('unrelated developers cannot mutate unassigned ownership or collaborators',async()=>{
   await asUser(admin);const task=await rpc('create_workspace_task',{request_id:request(),title:'Unassigned',website_ids:[]});
   await asUser(developer);
   await assert.rejects(action(task,'handover',{member_id:developer}),/creator, assignee or manager/);
   await assert.rejects(action(task,'collaborator_add',{member_id:developer}),/creator, assignee or manager/);
  });
  await t.test('terminal transitions withdraw pending requests so acceptance cannot silently reopen a task',async()=>{
   await asUser(admin);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Cancel pending',assignee_id:developer,website_ids:[]});
   const assignment=(await db.query<{id:string}>("select id from public.assignment_requests where task_id=$1 and state='pending'",[task])).rows[0].id;
   await action(task,'status',{status:'cancelled'});
   await asUser(developer);await assert.rejects(db.query('select public.respond_workspace_assignment($1,true,$2)',[assignment,'']),/already been answered/);
   await asUser(admin);await action(task,'status',{status:'to_do',reason:'Work is needed after all'});
   assert.equal((await db.query<{progress:string}>('select progress from public.tasks where id=$1',[task])).rows[0].progress,'to_do');
  });
  await t.test('reviewer reassignment enforces independence and workspace scope',async()=>{
   await asUser(admin);const task=await rpc('create_workspace_task',{request_id:request(),title:'Review override',assignee_id:admin,review_required:true,reviewer_id:developer,website_ids:[]});
   await assert.rejects(action(task,'reviewer',{member_id:admin}),/independent reviewer/);
   await assert.rejects(action(task,'reviewer',{member_id:outsider}),/active members/);
   await action(task,'reviewer',{member_id:developer});
   assert.equal((await db.query<{reviewer_id:string}>('select reviewer_id from public.tasks where id=$1',[task])).rows[0].reviewer_id,developer);
  });
  await t.test('best-effort notification failure does not lose a successfully created assignment',async()=>{
   await db.exec(`reset role;create function public.test_notification_failure() returns trigger language plpgsql as $$ begin raise exception 'Simulated notification error';end $$;
    create trigger test_delivery_failure before insert on public.notifications for each row execute function public.test_notification_failure();`);
   try{await asUser(admin);const task=await rpc('create_workspace_task',{request_id:request(),title:'Delivery failure',assignee_id:developer,website_ids:[]});assert.equal((await db.query('select id from public.tasks where id=$1',[task])).rows.length,1)}
   finally{await db.exec('reset role;drop trigger test_delivery_failure on public.notifications;drop function public.test_notification_failure();')}
  });
  async function saveLog(input:Record<string,unknown>){return (await db.query<{result:{id:string;requires_confirmation:boolean;warnings:string[]}}>('select public.save_workspace_work_log($1::jsonb) as result',[JSON.stringify(input)])).rows[0].result}
  async function sheet(filters:Record<string,unknown>){return (await db.query<{result:{entry_count:number;total_minutes:number;entries:{id:string;user_id:string;websites:unknown[]}[];days:{work_date:string;minutes:number}[]}}>('select public.workspace_timesheet($1::jsonb) as result',[JSON.stringify({start:'2026-10-12',end:'2026-10-18',...filters})])).rows[0].result}
  await t.test('work logs credit the contributor and count multi-website time once in every aggregation',async()=>{
   await asUser(admin);const extra=await rpc('create_workspace_website',{request_id:request(),name:'Second website',country:'Canada',url:'https://second.example.org'});
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Shared task time',assignee_id:admin,website_ids:[siteA,extra]});
   await asUser(developer);
   const input={request_id:request(),work_date:'2026-10-15',duration_minutes:90,category:'Development',notes:'Contributed to a teammateâ€™s task',task_id:task,website_ids:[siteA,extra,siteA]};
   const saved=await saveLog(input);assert.ok(saved.id);assert.equal(saved.requires_confirmation,false);
   assert.equal((await saveLog(input)).id,saved.id);
   await assert.rejects(saveLog({...input,duration_minutes:120}),/already saved with different values/);
   const totals=await sheet({});assert.equal(totals.total_minutes,90);assert.equal(totals.entry_count,1);assert.equal(totals.entries[0].websites.length,2);assert.equal(totals.entries[0].user_id,developer);
   assert.equal((await sheet({website_id:extra})).total_minutes,90);assert.equal((await sheet({website_id:siteA})).total_minutes,90);
   assert.equal((await db.query<{assignee_id:string}>('select assignee_id from public.tasks where id=$1',[task])).rows[0].assignee_id,admin);
   await assert.rejects(saveLog({...input,request_id:request(),website_ids:[siteB]}),/active websites/);
   await assert.rejects(sheet({website_id:siteB}),/website from your workspace/);
   await asUser(outsider);assert.equal((await sheet({})).entry_count,0);
  });
  await t.test('standalone logs, own edits and admin corrections preserve original snapshots and contributor identity',async()=>{
   await asUser(developer);
   const original={request_id:request(),work_date:'2026-10-16',duration_minutes:60,category:'Meeting',notes:'Team planning',website_ids:[]};
   const saved=await saveLog(original);
   await saveLog({...original,request_id:request(),log_id:saved.id,expected_revision:1,duration_minutes:75});
   await assert.rejects(saveLog({...original,request_id:request(),log_id:saved.id,expected_revision:1,duration_minutes:80}),/work log changed/);
   const managerId='00000000-0000-4000-8000-000000000006';
   await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[managerId]);await db.query("insert into public.profiles(id,workspace_id,display_name,role) values($1,$2,'Manager','manager')",[managerId,workspaceA]);
   await asUser(managerId);await assert.rejects(saveLog({...original,request_id:request(),log_id:saved.id,expected_revision:2,duration_minutes:80,reason:'Manager edit'}),/Only the contributor or an administrator/);
   await asUser(admin);await assert.rejects(saveLog({...original,request_id:request(),log_id:saved.id,expected_revision:2,duration_minutes:80}),/correction requires a reason/);
   await saveLog({...original,request_id:request(),log_id:saved.id,expected_revision:2,duration_minutes:80,reason:'Corrected a transcription error'});
   const versions=(await db.query<{revision_number:number;actor_id:string;snapshot:{duration_minutes:number;user_id:string}}>('select revision_number,actor_id,snapshot from public.work_log_revisions where work_log_id=$1 order by revision_number',[saved.id])).rows;
   assert.equal(versions.length,3);assert.equal(versions[0].snapshot.duration_minutes,60);assert.equal(versions[1].snapshot.duration_minutes,75);assert.equal(versions[2].snapshot.user_id,developer);assert.equal(versions[2].actor_id,admin);
   await db.exec('reset role');await assert.rejects(db.query("update public.work_log_revisions set reason='Overwrite' where work_log_id=$1",[saved.id]),/Immutable record/);
  });
  await t.test('long-day and duplicate warnings require explicit confirmation, not silent rejection',async()=>{
   await asUser(developer);
   const input={request_id:request(),work_date:'2026-10-17',duration_minutes:720,category:'Maintenance',notes:'Maintenance window',website_ids:[]};
   await saveLog(input);
   const extra={...input,request_id:request(),duration_minutes:30,notes:'Final verification'};
   const warning=await saveLog(extra);assert.equal(warning.requires_confirmation,true);assert.match(warning.warnings.join(' '),/12 hours/);
   assert.equal((await sheet({start:'2026-10-17',end:'2026-10-17'})).total_minutes,720);
   await saveLog({...extra,confirm_warnings:true});assert.equal((await sheet({start:'2026-10-17',end:'2026-10-17'})).total_minutes,750);
   const duplicate={...extra,request_id:request()};const duplicateWarning=await saveLog(duplicate);assert.equal(duplicateWarning.requires_confirmation,true);assert.match(duplicateWarning.warnings.join(' '),/similar entry/);
   const confirmed=await saveLog({...duplicate,confirm_warnings:true});assert.equal((await saveLog({...duplicate,confirm_warnings:true})).id,confirmed.id);
   assert.equal((await sheet({start:'2026-10-17',end:'2026-10-17'})).total_minutes,780);
   await assert.rejects(saveLog({...input,request_id:request(),duration_minutes:0}),/Invalid work log/);
   await asUser(inactive);await assert.rejects(saveLog({...input,request_id:request()}),/Active workspace membership/);
  });
  await t.test('timesheet totals reconcile independently of pagination and filtered record exports',async()=>{
   await asUser(admin);const all=await sheet({});const first=await sheet({limit:1,offset:0});const next=await sheet({limit:1,offset:1});
   assert.equal(first.entries.length,1);assert.equal(first.total_minutes,all.total_minutes);assert.equal(first.entry_count,all.entry_count);assert.notEqual(first.entries[0].id,next.entries[0].id);
   assert.equal(all.days.reduce((sum,day)=>sum+Number(day.minutes),0),all.total_minutes);
   const contributor=await sheet({user_id:developer});assert.equal(contributor.total_minutes,all.total_minutes);
   await assert.rejects(sheet({user_id:outsider}),/contributor from your workspace/);
  });
  await t.test('published forms pin schemas, enforce assignments and preserve report corrections',async()=>{
   await asUser(admin);
   const fields=[{key:'summary',label:'Summary',type:'short_text',required:true,help:''}];
   const base={request_id:request(),action:'create',title:'Weekly update',description:'Report',type:'custom',fields,website_ids:[siteA]};
   const template=await rpc('manage_reporting_template',base);
   await rpc('manage_reporting_template',{request_id:request(),action:'publish',template_id:template,expected_revision:1});
   const version=(await db.query<{id:string}>('select id from public.form_template_versions where template_id=$1',[template])).rows[0].id;
   await asUser(developer);
   await assert.rejects(rpc('manage_reporting_template',{...base,request_id:request()}),/administrator/i);
   const input={request_id:request(),website_id:siteA,template_version_id:version,period_start:'2026-10-12',period_end:'2026-10-18',answers:{summary:'Completed work'}};
   const report=await rpc('submit_workspace_report',input);
   assert.equal(await rpc('submit_workspace_report',input),report);
   await assert.rejects(rpc('submit_workspace_report',{...input,request_id:request()}),/unique/i);
   await assert.rejects(rpc('submit_workspace_report',{...input,request_id:request(),period_start:'2026-10-19',period_end:'2026-10-25',answers:{}}),/required/i);
   await rpc('submit_workspace_report',{...input,request_id:request(),submission_id:report,expected_revision:1,reason:'Corrected summary',answers:{summary:'Corrected'}});
   assert.equal((await db.query<{n:number}>('select count(*)::integer n from public.report_revisions where submission_id=$1',[report])).rows[0].n,2);
   await assert.rejects(rpc('submit_workspace_report',{...input,request_id:request(),submission_id:report,expected_revision:1,reason:'Stale'}),/changed/i);
   await asUser(outsider);
   assert.equal(await count('report_submissions'),0);
   await assert.rejects(rpc('submit_workspace_report',{...input,request_id:request()}),/not found/i);
   await asUser(admin);
   await rpc('manage_reporting_template',{...base,request_id:request(),action:'save',template_id:template,expected_revision:2,fields:[...fields,{key:'extra',label:'Extra',type:'integer',required:true,help:''}]});
   await rpc('manage_reporting_template',{request_id:request(),action:'publish',template_id:template,expected_revision:3});
   await asUser(developer);
   await rpc('submit_workspace_report',{...input,request_id:request(),submission_id:report,expected_revision:2,reason:'Old version remains valid',answers:{summary:'Historical schema'}});
   await assert.rejects(rpc('submit_workspace_report',{...input,request_id:request(),period_start:'2026-10-19',period_end:'2026-10-25'}),/newer template/i);
   await db.exec('reset role');
   await assert.rejects(db.exec("update public.report_revisions set reason='overwrite'"),/Immutable/);
   await assert.rejects(db.exec("delete from public.form_template_versions"),/Immutable/);
  });
  await t.test('SEO measurements retain source and scale across immutable revisions',async()=>{
   await asUser(admin);
   const template=await rpc('manage_reporting_template',{request_id:request(),action:'create',title:'SEO',type:'seo',fields:seoFields,website_ids:[siteA]});
   await rpc('manage_reporting_template',{request_id:request(),action:'publish',template_id:template,expected_revision:1});
   const version=(await db.query<{id:string}>('select id from public.form_template_versions where template_id=$1',[template])).rows[0].id;
   await asUser(developer);
   const input={request_id:request(),website_id:siteA,template_version_id:version,period_start:'2026-10-12',period_end:'2026-10-18',answers:{seo_score:75,source:'Lighthouse desktop',measurement_date:'2026-10-15',scale:'0\u2013100'}};
   const id=await rpc('submit_workspace_report',input);
   await rpc('submit_workspace_report',{...input,request_id:request(),submission_id:id,reason:'Corrected reading',expected_revision:1,answers:{...input.answers,seo_score:80}});
   const metrics=(await db.query<{value:string;source:string;scale:string}>('select value,source,scale from public.metric_observations where submission_id=$1 order by value',[id])).rows;
   assert.deepEqual(metrics.map(m=>Number(m.value)),[75,80]);assert.equal(metrics[0].source,'Lighthouse desktop');assert.equal(Number(metrics[0].scale),100);
   await asUser(outsider);assert.equal(await count('metric_observations'),0);
   await db.exec('reset role');await assert.rejects(db.exec('delete from public.metric_observations'),/Immutable/);
  });
  await t.test('website management enforces scope, revisions and non-destructive archive/restore',async()=>{
   await asUser(admin);
   const input={request_id:request(),website_id:siteA,expected_revision:1,action:'save',name:'Updated A',country:'UK',url:'https://EXAMPLE.org/',cms:'WordPress',status:'maintenance',configuration:{hosting:'Provider',notes:'Updated operational note'}};
   const tasksBefore=await count('task_websites');const reportsBefore=await count('report_submissions');
   assert.equal(await rpc('manage_workspace_website',input),siteA);assert.equal(await rpc('manage_workspace_website',input),siteA);
   const site=(await db.query<{revision:number;canonical_url:string;configuration:{hosting:string}}>('select revision,canonical_url,configuration from public.websites where id=$1',[siteA])).rows[0];
   assert.equal(site.revision,2);assert.equal(site.canonical_url,'https://example.org');assert.equal(site.configuration.hosting,'Provider');
   await assert.rejects(rpc('manage_workspace_website',{...input,request_id:request()}),/changed/i);
   await assert.rejects(rpc('manage_workspace_website',{...input,request_id:request(),expected_revision:2,configuration:{password:'blocked'}}),/configuration/i);
   await asUser(developer);await assert.rejects(rpc('manage_workspace_website',{...input,request_id:request()}),/manager or administrator/i);
   await asUser(outsider);await assert.rejects(rpc('manage_workspace_website',{...input,request_id:request()}),/not found/i);
   await asUser(admin);
   await rpc('manage_workspace_website',{request_id:request(),website_id:siteA,expected_revision:2,action:'archive'});
   assert.equal(await count('task_websites'),tasksBefore);assert.equal(await count('report_submissions'),reportsBefore);
   await assert.rejects(rpc('manage_workspace_website',{...input,request_id:request(),expected_revision:3}),/Restore/i);
   await rpc('manage_workspace_website',{request_id:request(),website_id:siteA,expected_revision:3,action:'restore'});
   assert.equal((await db.query<{status:string}>('select status from public.websites where id=$1',[siteA])).rows[0].status,'active');
   const manager='00000000-0000-4000-8000-000000000006';await asUser(manager);
   await rpc('manage_workspace_website',{...input,request_id:request(),expected_revision:4});
   await asUser(admin);
  });
  await t.test('task edits preserve ownership, review and progress with revision and scope checks',async()=>{
   await asUser(developer);
   const task=await rpc('create_workspace_task',{request_id:request(),title:'Editable',website_ids:[siteA],assignee_id:developer,review_required:true,reviewer_id:admin});
   const input={request_id:request(),task_id:task,expected_revision:1,title:'Edited title',description:'Updated description',category:'Development',priority:'high',due_date:'2026-10-20',website_ids:[siteA]};
   await rpc('edit_workspace_task',input);assert.equal(await rpc('edit_workspace_task',input),task);
   const saved=(await db.query<{title:string;revision:number;assignee_id:string;progress:string;review_required:boolean}>('select * from public.tasks where id=$1',[task])).rows[0];
   assert.equal(saved.title,'Edited title');assert.equal(saved.revision,2);assert.equal(saved.assignee_id,developer);assert.equal(saved.progress,'to_do');assert.equal(saved.review_required,true);
   await assert.rejects(rpc('edit_workspace_task',{...input,request_id:request()}),/changed/i);
   await assert.rejects(rpc('edit_workspace_task',{...input,title:'Retry changed'}),/different values/i);
   await assert.rejects(rpc('edit_workspace_task',{...input,request_id:request(),expected_revision:2,website_ids:[siteB]}),/active websites/i);
   assert.equal((await db.query<{revision:number}>('select revision from public.tasks where id=$1',[task])).rows[0].revision,2);
   await asUser(outsider);await assert.rejects(rpc('edit_workspace_task',{...input,request_id:request(),expected_revision:2}),/not found/i);
   const manager='00000000-0000-4000-8000-000000000006';await asUser(manager);
   const unrelated=await rpc('create_workspace_task',{request_id:request(),title:'Other owner',website_ids:[]});
   await asUser(developer);await assert.rejects(rpc('edit_workspace_task',{...input,request_id:request(),task_id:unrelated}),/Only the creator/i);
   await asUser(admin);await rpc('edit_workspace_task',{...input,request_id:request(),expected_revision:2,website_ids:[]});
   assert.equal((await db.query<{n:number}>('select count(*)::integer n from public.task_websites where task_id=$1',[task])).rows[0].n,0);
   await db.exec('reset role');await assert.rejects(db.exec("update public.audit_events set action='replace' where action='task.edited'"),/Immutable/i);
  });
  await t.test('invitations require admin and verified matching email, preserve role, and enforce cancellation and expiry',async()=>{
   const invitee='00000000-0000-4000-8000-000000000010',wrong='00000000-0000-4000-8000-000000000011';
   await db.exec("reset role;insert into auth.users(id,email,email_confirmed_at) values('"+invitee+"','invited@example.org',now()),('"+wrong+"','wrong@example.org',now())");
   await asUser(developer);
   const input={request_id:request(),action:'invite',email:'invited@example.org',display_name:'New teammate',role:'manager'};
   await assert.rejects(rpc('manage_workspace_invitation',input),/Administrator/i);
   await asUser(admin);const result=JSON.parse(JSON.stringify(await rpc('manage_workspace_invitation',input))) as {id:string;should_send:boolean};
   assert.equal(result.should_send,true);const repeated=await rpc('manage_workspace_invitation',input) as unknown as {should_send:boolean};assert.equal(repeated.should_send,false);
   await assert.rejects(rpc('manage_workspace_invitation',{...input,request_id:request()}),/unique/i);
   await assert.rejects(rpc('manage_workspace_invitation',{request_id:request(),action:'resend',invitation_id:result.id}),/one minute/i);
   await asUser(wrong);assert.equal(await count('workspace_invitations'),0);
   await assert.rejects(db.query('select public.accept_workspace_invitation($1)',[result.id]),/not found/i);
   await asUser(outsider);assert.equal(await count('workspace_invitations'),0);
   await assert.rejects(rpc('manage_workspace_invitation',{request_id:request(),action:'cancel',invitation_id:result.id}),/not found/i);
   await asUser(invitee);const preview=await db.query<{info:{email:string;role:string}}>('select public.my_workspace_invitation($1) info',[result.id]);assert.equal(preview.rows[0].info.role,'manager');
   await db.query('select public.accept_workspace_invitation($1)',[result.id]);await db.query('select public.accept_workspace_invitation($1)',[result.id]);
   const member=(await db.query<{role:string}>('select role from public.profiles where id=$1',[invitee])).rows[0];assert.equal(member.role,'manager');
   await asUser(admin);await assert.rejects(rpc('manage_workspace_invitation',{...input,request_id:request()}),/membership/i);
   const cancelled=await rpc('manage_workspace_invitation',{...input,request_id:request(),email:'wrong@example.org'}) as unknown as {id:string};
   await rpc('manage_workspace_invitation',{request_id:request(),action:'cancel',invitation_id:cancelled.id});
   await asUser(wrong);await assert.rejects(db.query('select public.accept_workspace_invitation($1)',[cancelled.id]),/cancelled or expired/i);
   await asUser(admin);const expired=await rpc('manage_workspace_invitation',{...input,request_id:request(),email:'wrong@example.org'}) as unknown as {id:string};
   await db.query('select public.record_invitation_delivery($1,$2,false)',[expired.id,input.request_id]);
   await db.exec('reset role');await db.query("update public.workspace_invitations set expires_at=now()-interval '1 day',last_sent_at=now()-interval '2 minutes' where id=$1",[expired.id]);
   await asUser(wrong);await assert.rejects(db.query('select public.accept_workspace_invitation($1)',[expired.id]),/expired/i);
   await asUser(admin);const resend=await rpc('manage_workspace_invitation',{request_id:request(),action:'resend',invitation_id:expired.id}) as unknown as {should_send:boolean};assert.equal(resend.should_send,true);
   await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[wrong]);
   await asUser(wrong);await assert.rejects(db.query('select public.accept_workspace_invitation($1)',[expired.id]),/verified/i);
   await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[wrong]);
   await asUser(admin);await rpc('manage_workspace_invitation',{request_id:request(),action:'cancel',invitation_id:expired.id});
  });
  await t.test('dashboard aggregates use full scoped records and current report revisions without shared-time inflation',async()=>{
   await asUser(admin);
   const filters={start:'2026-10-12',end:'2026-10-18'};
   const dashboard=await rpc('workspace_dashboard',filters) as unknown as {total_minutes:number;seo:{value:number}[];daily:{minutes:number}[];task_count:number};
   const sum=(await db.query<{n:number}>("select coalesce(sum(duration_minutes),0)::integer n from public.work_logs where work_date between '2026-10-12' and '2026-10-18'")).rows[0].n;
   assert.equal(Number(dashboard.total_minutes),sum);assert.equal(dashboard.daily.reduce((n,d)=>n+Number(d.minutes),0),sum);
   assert.equal(dashboard.seo.length,1);assert.equal(Number(dashboard.seo[0].value),80);
   const scoped=await rpc('workspace_dashboard',{...filters,website_id:siteA,source:'Lighthouse desktop'}) as unknown as {total_minutes:number;seo_count:number};
   const linked=(await db.query<{n:number}>("select coalesce(sum(l.duration_minutes),0)::integer n from public.work_logs l where l.work_date between '2026-10-12' and '2026-10-18' and exists(select 1 from public.work_log_websites x where x.work_log_id=l.id and x.website_id=$1)",[siteA])).rows[0].n;
   assert.equal(Number(scoped.total_minutes),linked);assert.equal(Number(scoped.seo_count),1);
   const empty=await rpc('workspace_dashboard',{...filters,source:'Different source'}) as unknown as {seo_count:number};assert.equal(Number(empty.seo_count),0);
   await assert.rejects(rpc('workspace_dashboard',{...filters,website_id:siteB}),/not found/i);
   await assert.rejects(rpc('workspace_dashboard',{start:'2020-01-01',end:'2026-10-18'}),/Invalid/i);
   await asUser(outsider);const other=await rpc('workspace_dashboard',filters) as unknown as {seo_count:number;total_minutes:number};assert.equal(Number(other.seo_count),0);assert.equal(Number(other.total_minutes),0);
   await asUser(inactive);await assert.rejects(rpc('workspace_dashboard',filters),/Active membership/i);
  });
  await t.test('administrators provision existing Auth users, protect membership boundaries and retain deactivated history',async()=>{
   const newcomer='00000000-0000-4000-8000-000000000005';
   await db.exec('reset role');
   await db.query('insert into auth.users(id,email) values($1,$2)',[newcomer,'new@example.org']);
   await db.query('update auth.users set email=$1 where id=$2',['outside@example.org',outsider]);
   await asUser(developer);
   await assert.rejects(rpc('manage_workspace_member',{request_id:request(),action:'add',email:'new@example.org',display_name:'New Person',role:'developer'}),/Administrator access/);
   await assert.rejects(db.query('select * from public.workspace_team_members()'),/Administrator access/);
   await asUser(admin);
   await assert.rejects(rpc('manage_workspace_member',{request_id:request(),action:'add',email:'missing@example.org',display_name:'Missing',role:'developer'}),/Create this user/);
   await assert.rejects(rpc('manage_workspace_member',{request_id:request(),action:'add',email:'outside@example.org',display_name:'Outside',role:'developer'}),/already has a workspace/);
   const input={request_id:request(),action:'add',email:'new@example.org',display_name:'New Person',role:'developer'};
   assert.equal(await rpc('manage_workspace_member',input),newcomer);assert.equal(await rpc('manage_workspace_member',input),newcomer);
   await assert.rejects(rpc('manage_workspace_member',{request_id:request(),action:'update',member_id:admin,role:'developer',active:true}),/own administrator access/);
   await rpc('manage_workspace_member',{request_id:request(),action:'update',member_id:developer,role:'developer',active:false});
   await asUser(developer);
   assert.equal(await count('tasks'),0);
   await assert.rejects(rpc('create_workspace_task',{request_id:request(),title:'Blocked inactive',website_ids:[]}),/Active workspace membership/);
   await asUser(admin);assert.ok((await db.query('select id from public.tasks where assignee_id=$1',[developer])).rows.length>0);
  });
  await t.test('time-management removal preserves history but revokes RPCs and removes analytics fields',async()=>{
   await asUser(admin);const before=await count('work_logs');assert.ok(before>0);
   await db.exec('reset role');await db.exec(await readFile('supabase/migrations/202610150010_remove_time_management.sql','utf8'));
   await asUser(admin);assert.equal(await count('work_logs'),before);
   const dashboard=await rpc('workspace_dashboard',{start:'2026-10-12',end:'2026-10-18'}) as unknown as Record<string,unknown>;
   assert.ok('statuses' in dashboard);assert.ok('seo' in dashboard);for(const key of ['total_minutes','daily','contributors','websites','logs'])assert.equal(key in dashboard,false);
   await assert.rejects(rpc('workspace_timesheet',{start:'2026-10-12',end:'2026-10-18'}),/permission denied/i);
   await assert.rejects(rpc('save_workspace_work_log',{}),/permission denied/i);
  });
  await t.test('anonymous RPCs are forbidden',async()=>{
   await db.exec('reset role;set role anon;');
   await assert.rejects(rpc('create_workspace_task',{request_id:request(),title:'No access',website_ids:[]}),/permission denied/);
  });
 }finally{await db.close()}
});
