-- Apply after 001–008. Read-only analytics run under caller RLS.
begin;
create function public.workspace_dashboard(p_filters jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare actor public.profiles%rowtype;start_date date:=(p_filters->>'start')::date;end_date date:=(p_filters->>'end')::date;
 site uuid:=nullif(p_filters->>'website_id','')::uuid;member uuid:=nullif(p_filters->>'user_id','')::uuid;
 source_value text:=coalesce(p_filters->>'source','');today date;result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if start_date is null or end_date is null or end_date<start_date or end_date-start_date>366 or length(source_value)>500 then raise exception 'Invalid dashboard filters' using errcode='22023';end if;
 if site is not null and not exists(select 1 from public.websites where id=site and workspace_id=actor.workspace_id) then raise exception 'Website not found' using errcode='42501';end if;
 if member is not null and not exists(select 1 from public.profiles where id=member and workspace_id=actor.workspace_id) then raise exception 'Member not found' using errcode='42501';end if;
 select (now() at time zone w.timezone)::date into today from public.workspaces w where w.id=actor.workspace_id;
 with tasks as (
 select t.* from public.tasks t where t.workspace_id=actor.workspace_id and t.archived_at is null
 and (member is null or t.assignee_id=member) and (site is null or exists(select 1 from public.task_websites x where x.task_id=t.id and x.website_id=site))
 ), logs as (
 select l.* from public.work_logs l where l.workspace_id=actor.workspace_id and l.work_date between start_date and end_date
 and (member is null or l.user_id=member) and (site is null or exists(select 1 from public.work_log_websites x where x.work_log_id=l.id and x.website_id=site))
 ), metrics as (
 select m.*,w.name as website,s.submitter_id from public.metric_observations m join public.report_submissions s on s.id=m.submission_id and s.workspace_id=m.workspace_id and s.current_revision_id=m.report_revision_id
 join public.websites w on w.id=m.website_id and w.workspace_id=m.workspace_id
 where m.workspace_id=actor.workspace_id and m.measured_at between start_date and end_date and (site is null or m.website_id=site) and (member is null or s.submitter_id=member)
 ), statuses as (select progress,count(*) as count from tasks group by progress),
 workload as (select t.assignee_id,coalesce(p.display_name,'Unassigned') as name,count(*) as count from tasks t left join public.profiles p on p.id=t.assignee_id and p.workspace_id=t.workspace_id where t.progress not in ('completed','cancelled') group by t.assignee_id,p.display_name),
 daily as (select d::date as date,coalesce((select sum(duration_minutes) from logs l where l.work_date=d::date),0) as minutes from generate_series(start_date::timestamp,end_date::timestamp,interval '1 day') d),
 contributors as (select l.user_id,p.display_name as name,sum(l.duration_minutes) as minutes from logs l join public.profiles p on p.id=l.user_id and p.workspace_id=l.workspace_id group by l.user_id,p.display_name),
 sites as (select w.id,w.name,sum(l.duration_minutes) as minutes from logs l join public.work_log_websites x on x.work_log_id=l.id and x.workspace_id=l.workspace_id join public.websites w on w.id=x.website_id and w.workspace_id=x.workspace_id where site is null or w.id=site group by w.id,w.name)
 select jsonb_build_object(
 'today',today,'active_tasks',(select count(*) from tasks where progress not in ('completed','cancelled')),
 'overdue_tasks',(select count(*) from tasks where due_date<today and progress not in ('completed','cancelled')),
 'completed_tasks',(select count(*) from tasks where progress='completed' and (completed_at at time zone (select timezone from public.workspaces where id=actor.workspace_id))::date between start_date and end_date),
 'total_minutes',coalesce((select sum(duration_minutes) from logs),0),'log_count',(select count(*) from logs),
 'statuses',coalesce((select jsonb_agg(to_jsonb(statuses) order by progress) from statuses),'[]'),
 'workload',coalesce((select jsonb_agg(to_jsonb(workload) order by count desc,name) from workload),'[]'),
 'daily',coalesce((select jsonb_agg(to_jsonb(daily) order by date) from daily),'[]'),
 'contributors',coalesce((select jsonb_agg(to_jsonb(contributors) order by minutes desc,name) from contributors),'[]'),
 'websites',coalesce((select jsonb_agg(to_jsonb(sites) order by minutes desc,name) from sites),'[]'),
 'sources',coalesce((select jsonb_agg(source order by source) from (select distinct source from metrics) x),'[]'),
 'seo_count',(select count(*) from metrics where source_value='' or source=source_value),
 'seo',coalesce((select jsonb_agg(to_jsonb(x) order by measured_at,id) from (select * from metrics where source_value='' or source=source_value order by measured_at desc,id limit 500) x),'[]'),
 'task_count',(select count(*) from tasks),'tasks',coalesce((select jsonb_agg(to_jsonb(x) order by due_date nulls last,id) from (select id,title,progress,priority,assignee_id,due_date,completed_at from tasks order by due_date nulls last,id limit 50) x),'[]'),
 'logs',coalesce((select jsonb_agg(to_jsonb(x) order by work_date desc,id) from (select id,user_id,work_date,duration_minutes,notes from logs order by work_date desc,id limit 50) x),'[]')
 ) into result;
 return result;
end $$;
revoke all on function public.workspace_dashboard(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_dashboard(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
