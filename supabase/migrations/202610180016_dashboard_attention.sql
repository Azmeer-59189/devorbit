-- Apply after 001–015. Adds a configurable SEO audit schedule, the dashboard deadline split and
-- "Needs attention" counts, and the task-list filters (deadline, pending assignment) those counts open,
-- so every dashboard number matches the list it drills into.
begin;
alter table public.workspaces add column audit_interval_days integer not null default 90 check(audit_interval_days between 7 and 730);

create function public.set_audit_schedule(p_input jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;days_value integer;previous integer;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found or actor.role<>'administrator' then raise exception 'Only administrators can change the audit schedule.' using errcode='42501';end if;
 -- CASE fixes evaluation order, so the cast only sees a whole JSON number.
 if (case when jsonb_typeof(p_input->'interval_days')='number' and (p_input->>'interval_days') ~ '^\d{1,3}$' then (p_input->>'interval_days')::integer not between 7 and 730 else true end) then raise exception 'Choose an audit interval between 7 and 730 days.';end if;
 days_value:=(p_input->>'interval_days')::integer;
 select audit_interval_days into previous from public.workspaces where id=actor.workspace_id for update;
 if previous is distinct from days_value then
  update public.workspaces set audit_interval_days=days_value where id=actor.workspace_id;
  insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata) values(actor.workspace_id,actor.id,'workspace',actor.workspace_id,'audit_schedule.changed',jsonb_build_object('from',previous,'to',days_value));
 end if;
 return days_value;
end $$;
revoke all on function public.set_audit_schedule(jsonb) from public,anon,authenticated;
grant execute on function public.set_audit_schedule(jsonb) to authenticated;

-- A website is due for an audit when it is current and has no dated audit within the last
-- audit_interval_days (corrections keep their audit's date, so superseded rows need no special case).
create or replace function public.workspace_dashboard(p_filters jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare actor public.profiles%rowtype;start_date date:=(p_filters->>'start')::date;end_date date:=(p_filters->>'end')::date;
 site uuid:=nullif(p_filters->>'website_id','')::uuid;member uuid:=nullif(p_filters->>'user_id','')::uuid;
 source_value text:=coalesce(p_filters->>'source','');today date;audit_days integer;result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if start_date is null or end_date is null or end_date<start_date or end_date-start_date>366 or length(source_value)>500 then raise exception 'Invalid dashboard filters' using errcode='22023';end if;
 if site is not null and not exists(select 1 from public.websites where id=site and workspace_id=actor.workspace_id) then raise exception 'Website not found' using errcode='42501';end if;
 if member is not null and not exists(select 1 from public.profiles where id=member and workspace_id=actor.workspace_id) then raise exception 'Member not found' using errcode='42501';end if;
 select (now() at time zone w.timezone)::date,w.audit_interval_days into today,audit_days from public.workspaces w where w.id=actor.workspace_id;
 with tasks as (
 select t.* from public.tasks t where t.workspace_id=actor.workspace_id and t.archived_at is null
 and (member is null or t.assignee_id=member) and (site is null or exists(select 1 from public.task_websites x where x.task_id=t.id and x.website_id=site))
 ), open_tasks as (
 select count(*) as active,count(*) filter(where due_date<today) as overdue,count(*) filter(where due_date>=today) as on_time,count(*) filter(where due_date is null) as no_deadline
 from tasks where progress not in ('completed','cancelled')
 ), metrics as (
 select a.id,a.website_id,a.workspace_id,a.id as submission_id,a.score as value,100 as scale,a.source,a.measurement_date as measured_at,w.name as website,a.actor_id as submitter_id
 from public.website_seo_audits a join public.websites w on w.id=a.website_id and w.workspace_id=a.workspace_id
 where a.workspace_id=actor.workspace_id and a.measurement_date between start_date and end_date and (site is null or a.website_id=site) and (member is null or a.actor_id=member)
 and not exists(select 1 from public.website_seo_audits newer where newer.supersedes_id=a.id)
 union all
 select m.id,m.website_id,m.workspace_id,m.submission_id,m.value,m.scale,m.source,m.measured_at,w.name,s.submitter_id
 from public.metric_observations m join public.report_submissions s on s.id=m.submission_id and s.workspace_id=m.workspace_id and s.current_revision_id=m.report_revision_id
 join public.websites w on w.id=m.website_id and w.workspace_id=m.workspace_id
 where m.workspace_id=actor.workspace_id and m.measured_at between start_date and end_date and (site is null or m.website_id=site) and (member is null or s.submitter_id=member)
 and not exists(select 1 from public.website_seo_audits a where a.workspace_id=m.workspace_id and a.website_id=m.website_id and a.measurement_date=m.measured_at and a.source=m.source)
 ), statuses as (select progress,count(*) as count from tasks group by progress),
 workload as (select t.assignee_id,coalesce(p.display_name,'Unassigned') as name,count(*) as count from tasks t left join public.profiles p on p.id=t.assignee_id and p.workspace_id=t.workspace_id where t.progress not in ('completed','cancelled') group by t.assignee_id,p.display_name)
 select jsonb_build_object(
 'today',today,'active_tasks',(select active from open_tasks),
 'overdue_tasks',(select overdue from open_tasks),
 'completed_tasks',(select count(*) from tasks where progress='completed' and (completed_at at time zone (select timezone from public.workspaces where id=actor.workspace_id))::date between start_date and end_date),
 'statuses',coalesce((select jsonb_agg(to_jsonb(statuses) order by progress) from statuses),'[]'),
 'workload',coalesce((select jsonb_agg(to_jsonb(workload) order by count desc,name) from workload),'[]'),
 'deadlines',(select jsonb_build_object('on_time',on_time,'overdue',overdue,'no_deadline',no_deadline) from open_tasks),
 'attention',jsonb_build_object(
  'overdue',(select overdue from open_tasks),
  'blocked',(select count(*) from tasks where progress='blocked'),
  'pending_assignments',(select count(*) from tasks t where exists(select 1 from public.assignment_requests a where a.task_id=t.id and a.workspace_id=t.workspace_id and a.state='pending')),
  'audits_due',(select count(*) from public.websites w where w.workspace_id=actor.workspace_id and w.archived_at is null and w.status<>'archived' and (site is null or w.id=site)
   and not exists(select 1 from public.website_seo_audits a where a.workspace_id=w.workspace_id and a.website_id=w.id and a.measurement_date>today-audit_days)),
  'audit_interval_days',audit_days),
 'sources',coalesce((select jsonb_agg(source order by source) from (select distinct source from metrics) x),'[]'),
 'seo_count',(select count(*) from metrics where source_value='' or source=source_value),
 'seo',coalesce((select jsonb_agg(to_jsonb(x) order by measured_at,id) from (select * from metrics where source_value='' or source=source_value order by measured_at desc,id limit 500) x),'[]'),
 'task_count',(select count(*) from tasks),'tasks',coalesce((select jsonb_agg(to_jsonb(x) order by due_date nulls last,id) from (select id,title,progress,priority,assignee_id,due_date,completed_at from tasks order by due_date nulls last,id limit 50) x),'[]')
 ) into result;
 return result;
end $$;
revoke all on function public.workspace_dashboard(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_dashboard(jsonb) to authenticated;

-- deadline: 'on_time' (due today or later) or 'none' (no due date). pending: has a pending assignment request.
create or replace function public.workspace_task_list(p_filters jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare actor public.profiles%rowtype;scope_value text:=coalesce(p_filters->>'scope','all');q text:=lower(trim(coalesce(p_filters->>'q','')));
 owner_value text:=coalesce(p_filters->>'owner','');creator uuid:=nullif(p_filters->>'creator','')::uuid;site uuid:=nullif(p_filters->>'website','')::uuid;
 status_value text:=coalesce(p_filters->>'status','');priority_value text:=coalesce(p_filters->>'priority','');
 start_date date:=nullif(p_filters->>'start','')::date;end_date date:=nullif(p_filters->>'end','')::date;
 overdue boolean:=coalesce((p_filters->>'overdue')::boolean,false);sort_value text:=coalesce(p_filters->>'sort','newest');
 deadline_value text:=coalesce(p_filters->>'deadline','');pending_only boolean:=coalesce((p_filters->>'pending')::boolean,false);
 page_value integer:=coalesce((p_filters->>'page')::integer,1);export_value boolean:=coalesce((p_filters->>'export')::boolean,false);
 size_value integer;today date;zone text;result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if scope_value not in ('all','assigned','pending','created','completed') or length(q)>200 or page_value not between 1 and 1000000
 or sort_value not in ('newest','oldest','due','priority','title') or status_value not in ('','open','to_do','in_progress','blocked','in_review','completed','cancelled')
 or priority_value not in ('','low','medium','high','urgent') or deadline_value not in ('','on_time','none')
 or (start_date is not null and end_date is not null and end_date<start_date) then raise exception 'Invalid task filters' using errcode='22023';end if;
 if owner_value not in ('','unassigned') and not exists(select 1 from public.profiles where id=owner_value::uuid and workspace_id=actor.workspace_id) then raise exception 'Owner not found' using errcode='42501';end if;
 if creator is not null and not exists(select 1 from public.profiles where id=creator and workspace_id=actor.workspace_id) then raise exception 'Creator not found' using errcode='42501';end if;
 if site is not null and not exists(select 1 from public.websites where id=site and workspace_id=actor.workspace_id) then raise exception 'Website not found' using errcode='42501';end if;
 if export_value then size_value:=5000;page_value:=1;else size_value:=25;end if;
 select timezone into zone from public.workspaces where id=actor.workspace_id;today:=(now() at time zone zone)::date;
 with filtered as (
 select t.*,a.id as pending_assignment_id,a.recipient_id as pending_recipient_id from public.tasks t
 left join public.assignment_requests a on a.task_id=t.id and a.workspace_id=t.workspace_id and a.state='pending'
 where t.workspace_id=actor.workspace_id and t.archived_at is null
 and (scope_value='all' or (scope_value='assigned' and t.assignee_id=actor.id and t.progress not in ('completed','cancelled'))
 or (scope_value='pending' and a.recipient_id=actor.id) or (scope_value='created' and t.creator_id=actor.id) or (scope_value='completed' and t.assignee_id=actor.id and t.progress='completed'))
 and (q='' or position(q in lower(t.title||' '||coalesce(t.description,'')||' '||t.category))>0)
 and (owner_value='' or (owner_value='unassigned' and t.assignee_id is null) or t.assignee_id::text=owner_value)
 and (creator is null or t.creator_id=creator) and (site is null or exists(select 1 from public.task_websites x where x.task_id=t.id and x.website_id=site))
 and (status_value='' or (status_value='open' and t.progress not in ('completed','cancelled')) or t.progress::text=status_value) and (priority_value='' or t.priority=priority_value)
 and (start_date is null or (t.created_at at time zone zone)::date>=start_date) and (end_date is null or (t.created_at at time zone zone)::date<=end_date)
 and (not overdue or (t.due_date<today and t.progress not in ('completed','cancelled')))
 and (deadline_value='' or (deadline_value='on_time' and t.due_date>=today) or (deadline_value='none' and t.due_date is null))
 and (not pending_only or a.id is not null)
 ), paged as (select * from filtered order by
 case when sort_value='newest' then created_at end desc,case when sort_value='oldest' then created_at end asc,
 case when sort_value='due' then due_date end asc nulls last,
 case when sort_value='priority' then case priority when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end end desc,
 case when sort_value='title' then lower(title) end asc,id limit size_value offset (page_value-1)*size_value)
 select jsonb_build_object('total',(select count(*) from filtered),'page',page_value,'page_size',size_value,
 'tasks',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('website_ids',coalesce((select jsonb_agg(website_id order by website_id) from public.task_websites x where x.task_id=p.id),'[]'))) from paged p),'[]'),
 'board_counts',coalesce((select jsonb_object_agg(progress,n) from (select progress,count(*) n from filtered where assignee_id is not null group by progress) x),'{}'),
 'unassigned',(select count(*) from filtered where assignee_id is null)) into result;
 return result;
end $$;
revoke all on function public.workspace_task_list(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_task_list(jsonb) to authenticated;

-- Same catalog as 012, plus the schedule and a per-website audit_due flag that uses the dashboard's rule.
create or replace function public.fixed_seo_catalog(p_site uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;today date;audit_days integer;sites jsonb;
begin
 -- The original reader still scopes every row to verified membership and workspace.
 result:=public.fixed_seo_catalog_record(p_site);
 select (now() at time zone w.timezone)::date,w.audit_interval_days into today,audit_days from public.profiles p join public.workspaces w on w.id=p.workspace_id where p.id=auth.uid() and p.active;
 select coalesce(jsonb_agg(w||public.enrich_fixed_seo((w->'fields')||jsonb_build_object('website_url',w->>'canonical_url','cms',coalesce(w->>'cms','')),w->'notes',today,w->>'source')
 ||jsonb_build_object('audit_due',w->>'archived_at' is null and w->>'status'<>'archived' and coalesce((w->'latest_audit'->>'measurement_date')::date<=today-audit_days,true)) order by w->>'name'),'[]')
 into sites from jsonb_array_elements(result->'websites') w;
 return result||jsonb_build_object('websites',sites,'automatic_reference_date',today,'audit_interval_days',audit_days);
end $$;
revoke all on function public.fixed_seo_catalog(uuid) from public,anon,authenticated;
grant execute on function public.fixed_seo_catalog(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
