-- Apply after 022. Removing the category column preserves existing task categories.
begin;
create or replace function public.sync_task_sheet(p_workspace uuid,p_actor uuid,p_sheet text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;r jsonb;t public.tasks%rowtype;owner_id uuid;site_id uuid;site_name text;sites uuid[];
 v_task uuid;hash text;zone text;completed timestamptz;created timestamptz;changed integer:=0;skipped integer:=0;seen uuid[]:='{}';
begin
 select * into actor from public.profiles where id=p_actor and workspace_id=p_workspace and active and role in ('administrator','manager') for share;
 if not found then raise exception 'Sheet sync requires an active manager or administrator.' using errcode='42501';end if;
 if coalesce(length(p_sheet),0) not between 10 and 200 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>200 then raise exception 'Invalid task sheet input.';end if;
 perform pg_advisory_xact_lock(hashtextextended('task-sheet:'||p_workspace::text,0));
 select timezone into zone from public.workspaces where id=p_workspace;
 for r in select value from jsonb_array_elements(p_rows) loop
  v_task:=(r->>'id')::uuid;hash:=md5(r::text);owner_id:=null;sites:='{}';
  if v_task is null or v_task=any(seen) then raise exception 'Task IDs must be unique.';end if;seen:=array_append(seen,v_task);
  if coalesce(length(trim(r->>'title')),0) not between 1 and 200 or length(coalesce(r->>'description',''))>10000
   or (r?'category' and coalesce(length(r->>'category'),0) not between 1 and 100) or coalesce(r->>'priority','') not in ('low','medium','high','urgent')
   or coalesce(r->>'status','') not in ('to_do','in_progress','blocked','in_review','completed','cancelled')
   or length(coalesce(r->>'blocker',''))>2000 or length(coalesce(r->>'completion_notes',''))>5000
   or jsonb_typeof(r->'archived') is distinct from 'boolean' or jsonb_typeof(r->'websites') is distinct from 'array' or jsonb_array_length(r->'websites')>50 then raise exception 'Invalid task sheet fields.';end if;
  if r?'blocker' and r->>'status'='blocked' and length(trim(coalesce(r->>'blocker','')))=0 then raise exception 'Blocked tasks need a blocker.';end if;
  completed:=((r->>'completed_date')::date)::timestamp at time zone zone;
  if (r->>'status'='completed') is distinct from (completed is not null) then raise exception 'Completed tasks need a completion date; unfinished tasks must leave it blank.';end if;
  if coalesce(r->>'assignee','')<>'' then
   if (select count(*) from public.profiles where workspace_id=p_workspace and active and display_name=r->>'assignee')<>1 then raise exception 'Assignee must match one active team member exactly: %',left(r->>'assignee',200);end if;
   select id into owner_id from public.profiles where workspace_id=p_workspace and active and display_name=r->>'assignee' for share;
  end if;
  foreach site_name in array array(select jsonb_array_elements_text(r->'websites')) loop
   if (select count(*) from public.websites where workspace_id=p_workspace and name=site_name)<>1 then raise exception 'Website must match one registry website exactly: %',left(site_name,200);end if;
   select id into site_id from public.websites where workspace_id=p_workspace and name=site_name for share;
   sites:=array_append(sites,site_id);
  end loop;
  select * into t from public.tasks where id=v_task for update;
  if found and t.workspace_id<>p_workspace then raise exception 'Task belongs to another workspace.' using errcode='42501';end if;
  if exists(select 1 from public.task_sheet_links where task_sheet_links.task_id=v_task and (workspace_id<>p_workspace or sheet_id<>p_sheet)) then raise exception 'Task is already connected to another sheet.';end if;
  if exists(select 1 from public.task_sheet_links where task_sheet_links.task_id=v_task and payload_hash=hash) then skipped:=skipped+1;continue;end if;
  created:=coalesce(((r->>'created_date')::date)::timestamp at time zone zone,t.created_at,least(completed,now()));
  if completed<created then raise exception 'Completed date must not precede created date.';end if;
  if t.id is null then
   insert into public.tasks(id,workspace_id,creator_id,title,category,priority) values(v_task,p_workspace,p_actor,r->>'title',coalesce(r->>'category','general'),r->>'priority');
  end if;
  -- Sheet completion is an explicit reporting workflow, not a dashboard review approval.
  update public.assignment_requests set state='withdrawn',responded_at=now() where assignment_requests.task_id=v_task and state='pending';
  update public.tasks set title=r->>'title',description=case when r?'description' then r->>'description' else t.description end,category=case when r?'category' then r->>'category' else coalesce(t.category,'general') end,priority=r->>'priority',
   progress=(r->>'status')::public.task_progress,assignee_id=owner_id,due_date=case when r?'due_date' then (r->>'due_date')::date else t.due_date end,
   blocker_reason=case when r?'blocker' then nullif(r->>'blocker','') when r->>'status'='blocked' then coalesce(nullif(t.blocker_reason,''),'Blocked in Google Sheets; no reason recorded.') else t.blocker_reason end,review_required=false,reviewer_id=null,
   completed_at=completed,completed_by=case when completed is not null then p_actor else null end,
   completion_notes=case when r?'completion_notes' then nullif(r->>'completion_notes','') else t.completion_notes end,created_at=created,
   archived_at=case when (r->>'archived')::boolean then coalesce(t.archived_at,now()) else null end,revision=revision+1
   where id=v_task;
  delete from public.task_websites where task_websites.task_id=v_task;
  insert into public.task_websites(workspace_id,task_id,website_id) select p_workspace,v_task,x from (select distinct unnest(sites) x) ids;
  insert into public.task_sheet_links(workspace_id,sheet_id,task_id,payload_hash) values(p_workspace,p_sheet,v_task,hash)
   on conflict(workspace_id,sheet_id,task_id) do update set payload_hash=excluded.payload_hash,last_synced_at=now();
  insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
   values(p_workspace,p_actor,'task',v_task,'task.sheet_synced',jsonb_build_object('sheet_id',p_sheet,'previous_status',t.progress,'status',r->>'status'));
  changed:=changed+1;
 end loop;
 insert into public.task_sheet_sync_state(workspace_id,sheet_id) values(p_workspace,p_sheet)
  on conflict(workspace_id,sheet_id) do update set last_synced_at=now();
 return jsonb_build_object('updated',changed,'unchanged',skipped,'synced_at',now());
end $$;
revoke all on function public.sync_task_sheet(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_task_sheet(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
