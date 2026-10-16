-- Apply after 001–014. Adds an 'open' status filter (not completed or cancelled, matching the dashboard workload
-- chart) and an export mode that returns up to 5000 matching tasks in one call for CSV/Excel downloads.
begin;
create or replace function public.workspace_task_list(p_filters jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare actor public.profiles%rowtype;scope_value text:=coalesce(p_filters->>'scope','all');q text:=lower(trim(coalesce(p_filters->>'q','')));
 owner_value text:=coalesce(p_filters->>'owner','');creator uuid:=nullif(p_filters->>'creator','')::uuid;site uuid:=nullif(p_filters->>'website','')::uuid;
 status_value text:=coalesce(p_filters->>'status','');priority_value text:=coalesce(p_filters->>'priority','');
 start_date date:=nullif(p_filters->>'start','')::date;end_date date:=nullif(p_filters->>'end','')::date;
 overdue boolean:=coalesce((p_filters->>'overdue')::boolean,false);sort_value text:=coalesce(p_filters->>'sort','newest');
 page_value integer:=coalesce((p_filters->>'page')::integer,1);export_value boolean:=coalesce((p_filters->>'export')::boolean,false);
 size_value integer;today date;zone text;result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if scope_value not in ('all','assigned','pending','created','completed') or length(q)>200 or page_value not between 1 and 1000000
 or sort_value not in ('newest','oldest','due','priority','title') or status_value not in ('','open','to_do','in_progress','blocked','in_review','completed','cancelled')
 or priority_value not in ('','low','medium','high','urgent') or (start_date is not null and end_date is not null and end_date<start_date) then raise exception 'Invalid task filters' using errcode='22023';end if;
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
notify pgrst,'reload schema';
commit;
