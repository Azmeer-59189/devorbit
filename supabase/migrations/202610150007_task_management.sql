-- Apply after 001–006. Metadata edits never bypass assignment or review workflows.
begin;
create function public.edit_workspace_task(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;t public.tasks%rowtype;r public.mutation_receipts%rowtype;
 req uuid:=(p_input->>'request_id')::uuid;task_id uuid:=(p_input->>'task_id')::uuid;
 title_value text:=trim(p_input->>'title');description_value text:=trim(coalesce(p_input->>'description',''));
 category_value text:=trim(p_input->>'category');priority_value text:=p_input->>'priority';
 due_value date:=nullif(p_input->>'due_date','')::date;sites uuid[];site uuid;before_data jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if req is null or task_id is null then raise exception 'Invalid task identity';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||req::text,0));
 select * into r from public.mutation_receipts where actor_id=actor.id and request_id=req;
 if found then
  if r.action<>'task.edit' or r.entity_id<>task_id or r.payload_hash is distinct from md5(p_input::text) then raise exception 'Request already saved with different values.';end if;
  return r.entity_id;
 end if;
 select * into t from public.tasks x where x.id=task_id and x.workspace_id=actor.workspace_id and x.archived_at is null for update;
 if not found then raise exception 'Task not found' using errcode='42501';end if;
 if not coalesce(actor.role in ('administrator','manager') or actor.id=t.creator_id or actor.id=t.assignee_id,false) then raise exception 'Only the creator, assignee or manager can edit this task.' using errcode='42501';end if;
 if (p_input->>'expected_revision')::integer is distinct from t.revision then raise exception 'Task changed; refresh before editing.' using errcode='40001';end if;
 if coalesce(length(title_value),0) not between 1 and 200 or length(description_value)>10000 or coalesce(length(category_value),0) not between 1 and 100
  or priority_value is null or priority_value not in ('low','medium','high','urgent') or jsonb_typeof(p_input->'website_ids') is distinct from 'array' or jsonb_array_length(p_input->'website_ids')>50 then raise exception 'Invalid task fields.' using errcode='22023';end if;
 select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into sites from jsonb_array_elements_text(p_input->'website_ids');
 foreach site in array sites loop
  perform 1 from public.websites w where w.id=site and w.workspace_id=actor.workspace_id and
   ((w.archived_at is null and w.status<>'archived') or exists(select 1 from public.task_websites tw where tw.task_id=t.id and tw.website_id=site)) for share;
  if not found then raise exception 'Select active websites from your workspace.';end if;
 end loop;
 before_data:=jsonb_build_object('title',t.title,'description',t.description,'category',t.category,'priority',t.priority,'due_date',t.due_date,'revision',t.revision,
  'website_ids',(select coalesce(jsonb_agg(tw.website_id),'[]') from public.task_websites tw where tw.task_id=t.id));
 update public.tasks set title=title_value,description=description_value,category=category_value,priority=priority_value,due_date=due_value,revision=revision+1 where id=t.id;
 delete from public.task_websites tw where tw.task_id=t.id;
 foreach site in array sites loop insert into public.task_websites(workspace_id,task_id,website_id) values(actor.workspace_id,t.id,site);end loop;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
  values(actor.workspace_id,actor.id,'task',t.id,'task.edited',jsonb_build_object('before',before_data,'after',p_input-'request_id'-'task_id'-'expected_revision'));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id,payload_hash) values(actor.id,req,'task.edit',t.id,md5(p_input::text));
 return t.id;
end $$;
revoke all on function public.edit_workspace_task(jsonb) from public,anon,authenticated;
grant execute on function public.edit_workspace_task(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
