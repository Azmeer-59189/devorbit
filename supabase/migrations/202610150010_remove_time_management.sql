-- Apply after 001-009. Remove time analytics and disable legacy time-management RPCs.
begin;
create or replace function public.workspace_dashboard(p_filters jsonb) returns jsonb
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
 ), metrics as (
 select m.*,w.name as website,s.submitter_id from public.metric_observations m join public.report_submissions s on s.id=m.submission_id and s.workspace_id=m.workspace_id and s.current_revision_id=m.report_revision_id
 join public.websites w on w.id=m.website_id and w.workspace_id=m.workspace_id
 where m.workspace_id=actor.workspace_id and m.measured_at between start_date and end_date and (site is null or m.website_id=site) and (member is null or s.submitter_id=member)
 ), statuses as (select progress,count(*) as count from tasks group by progress),
 workload as (select t.assignee_id,coalesce(p.display_name,'Unassigned') as name,count(*) as count from tasks t left join public.profiles p on p.id=t.assignee_id and p.workspace_id=t.workspace_id where t.progress not in ('completed','cancelled') group by t.assignee_id,p.display_name)
 select jsonb_build_object(
 'today',today,'active_tasks',(select count(*) from tasks where progress not in ('completed','cancelled')),
 'overdue_tasks',(select count(*) from tasks where due_date<today and progress not in ('completed','cancelled')),
 'completed_tasks',(select count(*) from tasks where progress='completed' and (completed_at at time zone (select timezone from public.workspaces where id=actor.workspace_id))::date between start_date and end_date),
 'statuses',coalesce((select jsonb_agg(to_jsonb(statuses) order by progress) from statuses),'[]'),
 'workload',coalesce((select jsonb_agg(to_jsonb(workload) order by count desc,name) from workload),'[]'),
 'sources',coalesce((select jsonb_agg(source order by source) from (select distinct source from metrics) x),'[]'),
 'seo_count',(select count(*) from metrics where source_value='' or source=source_value),
 'seo',coalesce((select jsonb_agg(to_jsonb(x) order by measured_at,id) from (select * from metrics where source_value='' or source=source_value order by measured_at desc,id limit 500) x),'[]'),
 'task_count',(select count(*) from tasks),'tasks',coalesce((select jsonb_agg(to_jsonb(x) order by due_date nulls last,id) from (select id,title,progress,priority,assignee_id,due_date,completed_at from tasks order by due_date nulls last,id limit 50) x),'[]')
 ) into result;
 return result;
end $$;
revoke all on function public.workspace_dashboard(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_dashboard(jsonb) to authenticated;
revoke all on function public.save_workspace_work_log(jsonb),public.workspace_timesheet(jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
