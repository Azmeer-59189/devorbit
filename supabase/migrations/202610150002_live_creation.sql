-- Apply AFTER 202610150001_foundation.sql. RLS remains enabled.
-- Authenticated callers receive only narrow, validated transactional RPC access.
begin;

create table public.mutation_receipts (
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  action text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
alter table public.mutation_receipts enable row level security;
revoke all on public.mutation_receipts from anon,authenticated;

create function public.create_workspace_website(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  v_request_id uuid := (p_input->>'request_id')::uuid;
  previous public.mutation_receipts%rowtype;
  website_id uuid;
  name_value text := trim(p_input->>'name');
  country_value text := trim(p_input->>'country');
  url_value text := trim(p_input->>'url');
  cms_value text := trim(coalesce(p_input->>'cms',''));
begin
  select * into actor from public.profiles where id=auth.uid() and active for share;
  if not found then raise exception 'Active workspace membership required' using errcode='42501'; end if;
  if actor.role not in ('administrator','manager') then raise exception 'Only administrators and managers can add websites.' using errcode='42501'; end if;
  if v_request_id is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.id::text||v_request_id::text,0));
  select * into previous from public.mutation_receipts where actor_id=actor.id and mutation_receipts.request_id=v_request_id;
  if found then
    if previous.action<>'website.create' then raise exception 'This request was already used for another action.'; end if;
    return previous.entity_id;
  end if;
  if coalesce(length(name_value),0) not between 1 and 150 or coalesce(length(country_value),0) not between 1 and 100
     or coalesce(length(url_value),0) not between 8 and 2048 or length(cms_value)>100
     or url_value !~ '^https?://[^/?#[:space:]@]+(:[0-9]+)?(/[^?#[:space:]]*)?$' then
    raise exception 'Invalid website fields' using errcode='22023';
  end if;
  -- Canonical host casing is normalized again at the DB boundary for direct RPCs.
  url_value := regexp_replace(url_value,'^([^:]+://)([^/]+)', '\1'||lower(substring(url_value from '^https?://([^/]+)')));
  url_value := regexp_replace(url_value,'/$','');
  insert into public.websites(workspace_id,name,country,canonical_url,cms)
    values(actor.workspace_id,name_value,country_value,url_value,cms_value) returning id into website_id;
  insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
    values(actor.workspace_id,actor.id,'website',website_id,'website.created',jsonb_build_object('name',name_value));
  insert into public.mutation_receipts(actor_id,request_id,action,entity_id) values(actor.id,v_request_id,'website.create',website_id);
  return website_id;
end;
$$;

create function public.create_workspace_task(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  v_request_id uuid := (p_input->>'request_id')::uuid;
  previous public.mutation_receipts%rowtype;
  task_id uuid;
  site_id uuid;
  site_ids uuid[];
  assignee uuid := nullif(p_input->>'assignee_id','')::uuid;
  reviewer uuid := nullif(p_input->>'reviewer_id','')::uuid;
  needs_review boolean := coalesce((p_input->>'review_required')::boolean,false);
  title_value text := trim(p_input->>'title');
  description_value text := trim(coalesce(p_input->>'description',''));
  category_value text := trim(coalesce(p_input->>'category','general'));
  priority_value text := coalesce(p_input->>'priority','medium');
begin
  select * into actor from public.profiles where id=auth.uid() and active for share;
  if not found then raise exception 'Active workspace membership required' using errcode='42501'; end if;
  if v_request_id is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.id::text||v_request_id::text,0));
  select * into previous from public.mutation_receipts where actor_id=actor.id and mutation_receipts.request_id=v_request_id;
  if found then
    if previous.action<>'task.create' then raise exception 'This request was already used for another action.'; end if;
    return previous.entity_id;
  end if;
  if coalesce(length(title_value),0) not between 1 and 200 or length(description_value)>10000
    or length(category_value) not between 1 and 100 or priority_value not in ('low','medium','high','urgent') then
    raise exception 'Invalid task fields' using errcode='22023';
  end if;
  if jsonb_typeof(p_input->'website_ids') is distinct from 'array' or jsonb_array_length(p_input->'website_ids')>50 then
    raise exception 'Invalid website links' using errcode='22023';
  end if;
  if assignee is not null then
    perform 1 from public.profiles where id=assignee and workspace_id=actor.workspace_id and active for share;
    if not found then raise exception 'Select active members from your workspace.'; end if;
  end if;
  if needs_review then
    if reviewer is null or reviewer=assignee then raise exception 'Choose an independent reviewer.'; end if;
    perform 1 from public.profiles where id=reviewer and workspace_id=actor.workspace_id and active for share;
    if not found then raise exception 'Select active members from your workspace.'; end if;
  else reviewer := null;
  end if;
  select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into site_ids from jsonb_array_elements_text(p_input->'website_ids');
  foreach site_id in array site_ids loop
    perform 1 from public.websites where id=site_id and workspace_id=actor.workspace_id and archived_at is null and status<>'archived' for share;
    if not found then raise exception 'Select active websites from your workspace.'; end if;
  end loop;
  insert into public.tasks(workspace_id,creator_id,assignee_id,title,description,category,priority,due_date,review_required,reviewer_id)
    values(actor.workspace_id,actor.id,case when assignee=actor.id then actor.id else null end,title_value,description_value,category_value,priority_value,
      nullif(p_input->>'due_date','')::date,needs_review,reviewer) returning id into task_id;
  foreach site_id in array site_ids loop
    insert into public.task_websites(workspace_id,task_id,website_id) values(actor.workspace_id,task_id,site_id);
  end loop;
  if assignee is not null then
    insert into public.assignment_requests(workspace_id,task_id,recipient_id,requester_id,state,responded_at)
      values(actor.workspace_id,task_id,assignee,actor.id,case when assignee=actor.id then 'accepted'::public.assignment_state else 'pending'::public.assignment_state end,
        case when assignee=actor.id then now() else null end);
  end if;
  insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
    values(actor.workspace_id,actor.id,'task',task_id,'task.created',jsonb_build_object('assignee_id',assignee,'assignment_state',case when assignee is null then 'unassigned' when assignee=actor.id then 'accepted' else 'pending' end));
  insert into public.mutation_receipts(actor_id,request_id,action,entity_id) values(actor.id,v_request_id,'task.create',task_id);
  return task_id;
end;
$$;

create function public.respond_workspace_assignment(p_request_id uuid,p_accept boolean,p_reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  assignment public.assignment_requests%rowtype;
  task public.tasks%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid() and active for share;
  if not found then raise exception 'Active workspace membership required' using errcode='42501'; end if;
  -- All task mutations lock task first, then its assignment request.
  select t.* into task from public.tasks t join public.assignment_requests a on a.task_id=t.id and a.workspace_id=t.workspace_id
    where a.id=p_request_id and t.workspace_id=actor.workspace_id for update of t;
  if not found then raise exception 'Assignment not found' using errcode='42501'; end if;
  select * into assignment from public.assignment_requests where id=p_request_id for update;
  if assignment.recipient_id<>actor.id then raise exception 'Only the recipient can respond to this assignment.' using errcode='42501'; end if;
  if p_accept is null then raise exception 'Choose accept or decline' using errcode='22023'; end if;
  if assignment.state<>'pending' then
    if (p_accept and assignment.state='accepted') or (not p_accept and assignment.state='declined') then return task.id; end if;
    raise exception 'This assignment request has already been answered.';
  end if;
  if not p_accept and coalesce(length(trim(p_reason)),0)=0 then raise exception 'A decline reason is required.'; end if;
  if length(p_reason)>2000 then raise exception 'Reason is too long' using errcode='22023'; end if;
  if p_accept then
    if task.review_required and task.reviewer_id=actor.id then raise exception 'Choose an independent reviewer.'; end if;
    update public.tasks set assignee_id=actor.id,progress='to_do',revision=revision+1 where id=task.id;
  end if;
  update public.assignment_requests set state=case when p_accept then 'accepted'::public.assignment_state else 'declined'::public.assignment_state end,
    reason=case when p_accept then null else trim(p_reason) end,responded_at=now() where id=p_request_id;
  insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
    values(actor.workspace_id,actor.id,'task',task.id,case when p_accept then 'assignment.accepted' else 'assignment.declined' end,
      jsonb_build_object('request_id',p_request_id,'previous_assignee_id',task.assignee_id,'reason',case when p_accept then null else trim(p_reason) end));
  return task.id;
end;
$$;

revoke all on function public.create_workspace_website(jsonb) from public,anon,authenticated;
revoke all on function public.create_workspace_task(jsonb) from public,anon,authenticated;
revoke all on function public.respond_workspace_assignment(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.create_workspace_website(jsonb) to authenticated;
grant execute on function public.create_workspace_task(jsonb) to authenticated;
grant execute on function public.respond_workspace_assignment(uuid,boolean,text) to authenticated;
-- No general INSERT/UPDATE/DELETE grants. RLS and immutable audit triggers stay on.
notify pgrst,'reload schema';
commit;
