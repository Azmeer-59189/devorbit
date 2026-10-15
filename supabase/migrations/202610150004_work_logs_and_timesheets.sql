-- Apply after migrations 001–003. All work durations remain integer minutes.
begin;
alter table public.mutation_receipts add column payload_hash text;
create table public.work_log_revisions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,work_log_id uuid not null,
 revision_number integer not null check(revision_number>0),actor_id uuid,reason text,
 snapshot jsonb not null,created_at timestamptz not null default now(),unique(work_log_id,revision_number),
 foreign key(workspace_id,work_log_id) references public.work_logs(workspace_id,id),
 foreign key(workspace_id,actor_id) references public.profiles(workspace_id,id)
);
alter table public.work_log_revisions enable row level security;
create policy workspace_read on public.work_log_revisions for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.work_log_revisions from anon,authenticated;
grant select on public.work_log_revisions,public.work_logs,public.work_log_websites to authenticated;
create trigger immutable_work_log_revisions before update or delete on public.work_log_revisions for each row execute function public.reject_immutable_mutation();
insert into public.work_log_revisions(workspace_id,work_log_id,revision_number,reason,snapshot)
 select l.workspace_id,l.id,l.revision,'Baseline captured when work-log versioning was enabled',
  to_jsonb(l)||jsonb_build_object('website_ids',coalesce((select jsonb_agg(website_id order by website_id) from public.work_log_websites where work_log_id=l.id),'[]'))
 from public.work_logs l;
create index work_log_revisions_parent on public.work_log_revisions(workspace_id,work_log_id,revision_number desc);
create index work_logs_owner_date on public.work_logs(workspace_id,user_id,work_date);

create function public.save_workspace_work_log(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles%rowtype; original public.work_logs%rowtype; saved public.work_logs%rowtype;
 receipt public.mutation_receipts%rowtype; v_request uuid:=(p_input->>'request_id')::uuid;
 v_log uuid:=nullif(p_input->>'log_id','')::uuid; v_task uuid:=nullif(p_input->>'task_id','')::uuid;
 v_date date:=(p_input->>'work_date')::date; v_minutes integer:=(p_input->>'duration_minutes')::integer;
 v_category text:=trim(coalesce(p_input->>'category',''));v_notes text:=trim(coalesce(p_input->>'notes',''));
 v_reason text:=trim(coalesce(p_input->>'reason',''));v_sites uuid[];v_site uuid;owner_id uuid;
 day_minutes bigint;warnings jsonb:='[]';day_lock text;operation text;next_revision integer;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found then raise exception 'Active workspace membership required' using errcode='42501';end if;
 if v_request is null or v_date is null or v_minutes is null or v_minutes not between 1 and 1440
  or length(v_category) not between 1 and 100 or length(v_notes) not between 1 and 5000 or length(v_reason)>2000
  or jsonb_typeof(p_input->'website_ids') is distinct from 'array' or jsonb_array_length(p_input->'website_ids')>50 then
  raise exception 'Invalid work log fields' using errcode='22023';end if;
 operation:=case when v_log is null then 'work_log.create' else 'work_log.edit' end;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||v_request::text,0));
 select * into receipt from public.mutation_receipts where actor_id=actor.id and request_id=v_request;
 if found then
  if receipt.action<>operation or (v_log is not null and receipt.entity_id<>v_log) then raise exception 'This request was already used for another action.';end if;
  if receipt.payload_hash is distinct from md5((p_input-'confirm_warnings')::text) then raise exception 'This submission was already saved with different values. Refresh the timesheet before editing it.';end if;
  return jsonb_build_object('id',receipt.entity_id,'requires_confirmation',false,'warnings','[]'::jsonb);
 end if;
 if v_log is not null then
  select * into original from public.work_logs where id=v_log and workspace_id=actor.workspace_id for update;
  if not found then raise exception 'Work log not found' using errcode='42501';end if;
  if original.user_id<>actor.id and actor.role<>'administrator' then raise exception 'Only the contributor or an administrator can edit this work log.' using errcode='42501';end if;
  if original.user_id<>actor.id and length(v_reason)=0 then raise exception 'An administrator correction requires a reason.';end if;
  if (p_input->>'expected_revision')::integer is distinct from original.revision then raise exception 'This work log changed. Refresh before saving.' using errcode='40001';end if;
  owner_id:=original.user_id;next_revision:=original.revision+1;
 else owner_id:=actor.id;next_revision:=1;
 end if;
 -- Serialize totals for both dates in a stable order, including admin corrections.
 for day_lock in select distinct 'work-log-day:'||owner_id::text||':'||d::text from unnest(array[v_date,coalesce(original.work_date,v_date)]) d order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(day_lock,0));
 end loop;
 if v_task is not null then
  perform 1 from public.tasks where id=v_task and workspace_id=actor.workspace_id and (archived_at is null or v_task=original.task_id) for share;
  if not found then raise exception 'Select a task from your workspace.';end if;
 end if;
 select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_sites from jsonb_array_elements_text(p_input->'website_ids');
 foreach v_site in array v_sites loop
  perform 1 from public.websites w where w.id=v_site and w.workspace_id=actor.workspace_id
   and ((w.archived_at is null and w.status<>'archived') or exists(select 1 from public.work_log_websites where work_log_id=v_log and website_id=v_site)) for share;
  if not found then raise exception 'Select active websites from your workspace.';end if;
 end loop;
 select coalesce(sum(duration_minutes),0) into day_minutes from public.work_logs where workspace_id=actor.workspace_id and user_id=owner_id and work_date=v_date and id is distinct from v_log;
 if day_minutes+v_minutes>720 then warnings:=warnings||jsonb_build_array('This brings the contributor’s daily total above 12 hours.');end if;
 if exists(select 1 from public.work_logs where workspace_id=actor.workspace_id and user_id=owner_id and work_date=v_date and duration_minutes=v_minutes
  and task_id is not distinct from v_task and lower(trim(notes))=lower(v_notes) and id is distinct from v_log) then
  warnings:=warnings||jsonb_build_array('A similar entry already exists for this contributor and date. Check for duplicate work.');
 end if;
 if jsonb_array_length(warnings)>0 and not coalesce((p_input->>'confirm_warnings')::boolean,false) then
  return jsonb_build_object('requires_confirmation',true,'warnings',warnings,'daily_total_minutes',day_minutes+v_minutes);
 end if;
 if v_log is null then
  insert into public.work_logs(workspace_id,user_id,task_id,work_date,duration_minutes,category,notes)
   values(actor.workspace_id,owner_id,v_task,v_date,v_minutes,v_category,v_notes) returning * into saved;
  v_log:=saved.id;
 else
  update public.work_logs set task_id=v_task,work_date=v_date,duration_minutes=v_minutes,category=v_category,notes=v_notes,revision=next_revision where id=v_log returning * into saved;
  delete from public.work_log_websites where work_log_id=v_log;
 end if;
 foreach v_site in array v_sites loop insert into public.work_log_websites(workspace_id,work_log_id,website_id) values(actor.workspace_id,v_log,v_site);end loop;
 insert into public.work_log_revisions(workspace_id,work_log_id,revision_number,actor_id,reason,snapshot)
  values(actor.workspace_id,v_log,next_revision,actor.id,nullif(v_reason,''),to_jsonb(saved)||jsonb_build_object('website_ids',to_jsonb(v_sites)));
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
  values(actor.workspace_id,actor.id,'work_log',v_log,operation,jsonb_build_object('contributor_id',owner_id,'revision',next_revision,'previous_minutes',original.duration_minutes,'minutes',v_minutes,'reason',v_reason));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id,payload_hash) values(actor.id,v_request,operation,v_log,md5((p_input-'confirm_warnings')::text));
 return jsonb_build_object('id',v_log,'requires_confirmation',false,'warnings',warnings,'revision',next_revision);
end $$;

create function public.workspace_timesheet(p_filters jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
 actor public.profiles%rowtype;v_start date:=(p_filters->>'start')::date;v_end date:=(p_filters->>'end')::date;
 v_user uuid:=nullif(p_filters->>'user_id','')::uuid;v_site uuid:=nullif(p_filters->>'website_id','')::uuid;
 v_limit integer:=coalesce((p_filters->>'limit')::integer,50);v_offset integer:=coalesce((p_filters->>'offset')::integer,0);result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if not found then raise exception 'Active workspace membership required' using errcode='42501';end if;
 if v_start is null or v_end is null or v_end<v_start or v_end-v_start>366 or v_limit not between 1 and 10001 or v_offset not between 0 and 1000000 then raise exception 'Invalid timesheet filters' using errcode='22023';end if;
 if v_user is not null and not exists(select 1 from public.profiles where id=v_user and workspace_id=actor.workspace_id) then raise exception 'Select a contributor from your workspace.';end if;
 if v_site is not null and not exists(select 1 from public.websites where id=v_site and workspace_id=actor.workspace_id) then raise exception 'Select a website from your workspace.';end if;
 with filtered as (
  select l.*,p.display_name as contributor,t.title as task_title
  from public.work_logs l join public.profiles p on p.id=l.user_id and p.workspace_id=l.workspace_id
  left join public.tasks t on t.id=l.task_id and t.workspace_id=l.workspace_id
  where l.workspace_id=actor.workspace_id and l.work_date between v_start and v_end
   and (v_user is null or l.user_id=v_user)
   and (v_site is null or exists(select 1 from public.work_log_websites x where x.work_log_id=l.id and x.website_id=v_site))
 ),paged as (select * from filtered order by work_date desc,created_at desc,id limit v_limit offset v_offset),
 days as (select work_date,sum(duration_minutes) as minutes,count(*) as entries from filtered group by work_date),
 users as (select user_id,contributor,sum(duration_minutes) as minutes from filtered group by user_id,contributor)
 select jsonb_build_object(
  'entries',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('websites',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'archived',w.archived_at is not null or w.status='archived') order by w.name)
   from public.work_log_websites x join public.websites w on w.id=x.website_id and w.workspace_id=x.workspace_id where x.work_log_id=l.id),'[]')) order by l.work_date desc,l.created_at desc,l.id) from paged l),'[]'),
  'total_minutes',coalesce((select sum(duration_minutes) from filtered),0),'entry_count',(select count(*) from filtered),
  'contributor_count',(select count(distinct user_id) from filtered),
  'days',coalesce((select jsonb_agg(to_jsonb(days) order by work_date) from days),'[]'),
  'contributors',coalesce((select jsonb_agg(to_jsonb(users) order by contributor) from users),'[]')
 ) into result;
 return result;
end $$;
revoke all on function public.save_workspace_work_log(jsonb) from public,anon,authenticated;
revoke all on function public.workspace_timesheet(jsonb) from public,anon,authenticated;
grant execute on function public.save_workspace_work_log(jsonb) to authenticated;
grant execute on function public.workspace_timesheet(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
