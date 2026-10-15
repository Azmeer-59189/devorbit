-- Apply after 001 and 002. Keep RLS enabled. No Auth users are created here.
begin;
alter table public.tasks add column completed_by uuid;
alter table public.tasks add column completion_notes text;
alter table public.tasks add constraint task_completed_by_workspace_fk foreign key(workspace_id,completed_by) references public.profiles(workspace_id,id);
create table public.task_comments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 task_id uuid not null, author_id uuid not null, body text not null check(length(trim(body)) between 1 and 5000),
 created_at timestamptz not null default now(),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
 foreign key(workspace_id,author_id) references public.profiles(workspace_id,id)
);
create table public.task_collaborators (
 workspace_id uuid not null, task_id uuid not null,user_id uuid not null,
 created_at timestamptz not null default now(),primary key(task_id,user_id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
 foreign key(workspace_id,user_id) references public.profiles(workspace_id,id)
);
create table public.task_reviews (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null, task_id uuid not null,
 reviewer_id uuid not null,decision text not null check(decision in ('approved','changes_requested')),feedback text,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
 foreign key(workspace_id,reviewer_id) references public.profiles(workspace_id,id)
);
create trigger immutable_task_reviews before update or delete on public.task_reviews for each row execute function public.reject_immutable_mutation();
create table public.notifications (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,recipient_id uuid not null,
 task_id uuid not null,kind text not null,title text not null,event_key text not null,
 read_at timestamptz,created_at timestamptz not null default now(),unique(recipient_id,event_key),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
 foreign key(workspace_id,recipient_id) references public.profiles(workspace_id,id)
);
do $$ declare relation text; begin
 foreach relation in array array['task_comments','task_collaborators','task_reviews'] loop
  execute format('alter table public.%I enable row level security',relation);
  execute format('create policy workspace_read on public.%I for select to authenticated using(public.is_workspace_member(workspace_id))',relation);
  execute format('revoke all on public.%I from anon,authenticated',relation);
  execute format('grant select on public.%I to authenticated',relation);
 end loop;
end $$;
alter table public.notifications enable row level security;
create policy recipient_read on public.notifications for select to authenticated using(recipient_id=auth.uid() and public.is_workspace_member(workspace_id));
revoke all on public.notifications from anon,authenticated;
grant select on public.notifications to authenticated;
create index task_comments_parent on public.task_comments(workspace_id,task_id,created_at);
create index notifications_recipient on public.notifications(recipient_id,created_at desc);

create function public.queue_task_notification(p_workspace uuid,p_recipient uuid,p_task uuid,p_kind text,p_title text,p_event text) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(workspace_id,recipient_id,task_id,kind,title,event_key)
 values(p_workspace,p_recipient,p_task,p_kind,p_title,p_event) on conflict(recipient_id,event_key) do nothing;
exception when others then
 raise warning 'DevOrbit notification delivery failed (%).',sqlstate;
end $$;
-- Internal helper only. Business mutations decide and validate recipients.
revoke all on function public.queue_task_notification(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;

-- Internal trigger: cannot be called to supply arbitrary notification recipients.
create function public.notify_assignment_event() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; label text;
begin
 if tg_op='UPDATE' and old.state=new.state then return new; end if;
 if new.state='pending' then target:=new.recipient_id;label:='New task assignment request';
 elsif new.state='accepted' and new.requester_id<>new.recipient_id then target:=new.requester_id;label:='Your assignment request was accepted';
 elsif new.state='declined' then target:=new.requester_id;label:='Your assignment request was declined';
 elsif new.state in ('withdrawn','superseded') then target:=new.recipient_id;label:='A task assignment request was withdrawn';
 else return new;end if;
 perform public.queue_task_notification(new.workspace_id,target,new.task_id,'assignment.'||new.state,label,'assignment:'||new.id::text||':'||new.state);
 return new;
end $$;
revoke all on function public.notify_assignment_event() from public,anon,authenticated;
create trigger assignment_notifications after insert or update of state on public.assignment_requests for each row execute function public.notify_assignment_event();

create function public.mutate_workspace_task(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles%rowtype; current_task public.tasks%rowtype; previous public.mutation_receipts%rowtype;
 v_request uuid := (p_input->>'request_id')::uuid; v_task uuid := (p_input->>'task_id')::uuid;
 operation text := p_input->>'action'; v_reason text := trim(coalesce(p_input->>'reason',''));
 v_body text := trim(coalesce(p_input->>'body','')); v_member uuid := nullif(p_input->>'member_id','')::uuid;
 v_status public.task_progress; manager boolean; editable boolean; before_data jsonb; v_id uuid; mentioned uuid;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if v_request is null or v_task is null or length(v_reason)>2000 or length(v_body)>5000 then raise exception 'Invalid task action' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||v_request::text,0));
 select * into previous from public.mutation_receipts where actor_id=actor.id and request_id=v_request;
 if found then
  if previous.entity_id<>v_task or previous.action<>'task.'||operation then raise exception 'This request was already used for another action.';end if;
  return previous.entity_id;
 end if;
 select * into current_task from public.tasks where id=v_task and workspace_id=actor.workspace_id and archived_at is null for update;
 if not found then raise exception 'Task not found' using errcode='42501';end if;
 if (p_input->>'expected_revision')::integer is distinct from current_task.revision then raise exception 'This task changed. Refresh it before saving.' using errcode='40001';end if;
 manager:=actor.role in ('administrator','manager');
 editable:=coalesce(manager or actor.id=current_task.creator_id or actor.id=current_task.assignee_id,false);
 before_data:=jsonb_build_object('progress',current_task.progress,'assignee_id',current_task.assignee_id,'blocker_reason',current_task.blocker_reason,'revision',current_task.revision);
 if operation='status' then
  v_status:=(p_input->>'status')::public.task_progress;
  if v_status is null then raise exception 'Choose a status' using errcode='22023';end if;
  if not (manager or actor.id is not distinct from current_task.assignee_id or (current_task.assignee_id is null and actor.id=current_task.creator_id and (v_status='cancelled' or (current_task.progress='cancelled' and v_status='to_do')))) then raise exception 'Only the assignee or a manager can update progress.' using errcode='42501';end if;
  if current_task.assignee_id is null and v_status<>'cancelled' and not(current_task.progress='cancelled' and v_status='to_do') then raise exception 'Accept an assignment before updating progress.';end if;
  if current_task.progress=v_status then return current_task.id;end if;
  if current_task.progress in ('completed','cancelled') then
   if v_status not in ('to_do','in_progress') or length(v_reason)=0 then raise exception 'Reopening requires a reason and To Do or In Progress status.';end if;
  elsif current_task.progress='in_review' and v_status<>'cancelled' then raise exception 'Use a review decision for a task awaiting review.';
  end if;
  if v_status='blocked' and length(v_reason)=0 then raise exception 'A blocker reason is required.';end if;
  if v_status='in_review' and not current_task.review_required then raise exception 'This task does not require review.';end if;
  if v_status='completed' and current_task.review_required then raise exception 'An independent reviewer must approve this task.';end if;
  update public.tasks set progress=v_status,blocker_reason=case when v_status='blocked' then v_reason else null end,
   completed_at=case when v_status='completed' then now() else null end,completed_by=case when v_status='completed' then actor.id else null end,
   completion_notes=case when v_status='completed' then v_reason else null end where id=v_task;
  if v_status in ('completed','cancelled') then
   update public.assignment_requests set state='withdrawn',responded_at=now() where task_id=v_task and state='pending';
  end if;
  if v_status='in_review' then
   perform 1 from public.profiles where id=current_task.reviewer_id and workspace_id=actor.workspace_id and active for share;
   if not found then raise exception 'Choose an active independent reviewer.';end if;
   perform public.queue_task_notification(actor.workspace_id,current_task.reviewer_id,v_task,'review.requested','A task is ready for your review',v_request::text);
  end if;
 elsif operation in ('review_approve','review_changes') then
  if current_task.progress<>'in_review' or not current_task.review_required then raise exception 'This task is not awaiting review.';end if;
  if actor.id=current_task.assignee_id or not(manager or actor.id=current_task.reviewer_id) then raise exception 'Only an independent reviewer or manager can decide this review.' using errcode='42501';end if;
  if operation='review_changes' and length(v_reason)=0 then raise exception 'Explain the changes you need.';end if;
  insert into public.task_reviews(workspace_id,task_id,reviewer_id,decision,feedback)
   values(actor.workspace_id,v_task,actor.id,case when operation='review_approve' then 'approved' else 'changes_requested' end,v_reason);
  update public.tasks set progress=case when operation='review_approve' then 'completed'::public.task_progress else 'in_progress'::public.task_progress end,
   completed_at=case when operation='review_approve' then now() else null end,completed_by=case when operation='review_approve' then actor.id else null end,
   completion_notes=case when operation='review_approve' then v_reason else null end,blocker_reason=null where id=v_task;
  if operation='review_approve' then update public.assignment_requests set state='withdrawn',responded_at=now() where task_id=v_task and state='pending';end if;
  perform public.queue_task_notification(actor.workspace_id,current_task.assignee_id,v_task,'review.result',case when operation='review_approve' then 'Your task review was approved' else 'Changes requested on your task' end,v_request::text);
 elsif operation='comment' then
  if length(v_body)=0 then raise exception 'Enter a comment.';end if;
  if jsonb_typeof(coalesce(p_input->'mention_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_input->'mention_ids','[]'::jsonb))>50 then raise exception 'Invalid mentions' using errcode='22023';end if;
  insert into public.task_comments(workspace_id,task_id,author_id,body) values(actor.workspace_id,v_task,actor.id,v_body) returning id into v_id;
  for mentioned in select distinct value::uuid from jsonb_array_elements_text(coalesce(p_input->'mention_ids','[]'::jsonb)) loop
   perform 1 from public.profiles where id=mentioned and workspace_id=actor.workspace_id and active for share;
   if not found then raise exception 'Select active members from your workspace.';end if;
   if mentioned<>actor.id then perform public.queue_task_notification(actor.workspace_id,mentioned,v_task,'mention','You were mentioned in a task comment',v_id::text);end if;
  end loop;
 elsif operation in ('collaborator_add','collaborator_remove') then
  if not editable then raise exception 'Only the creator, assignee or manager can manage collaborators.' using errcode='42501';end if;
  if v_member is null then raise exception 'Choose a collaborator.';end if;
  if operation='collaborator_add' then
   perform 1 from public.profiles where id=v_member and workspace_id=actor.workspace_id and active for share;
   if not found then raise exception 'Select active members from your workspace.';end if;
   insert into public.task_collaborators(workspace_id,task_id,user_id) values(actor.workspace_id,v_task,v_member) on conflict do nothing;
  else delete from public.task_collaborators where task_id=v_task and user_id=v_member;end if;
 elsif operation='reviewer' then
  if not editable then raise exception 'Only the creator, assignee or manager can change the reviewer.' using errcode='42501';end if;
  if not current_task.review_required or v_member is null or v_member=current_task.assignee_id then raise exception 'Choose an independent reviewer.';end if;
  perform 1 from public.profiles where id=v_member and workspace_id=actor.workspace_id and active for share;
  if not found then raise exception 'Select active members from your workspace.';end if;
  update public.tasks set reviewer_id=v_member where id=v_task;
  if current_task.progress='in_review' then perform public.queue_task_notification(actor.workspace_id,v_member,v_task,'review.requested','A task is ready for your review',v_request::text);end if;
 elsif operation='handover' then
  if not editable then raise exception 'Only the creator, assignee or manager can request handover.' using errcode='42501';end if;
  if current_task.progress in ('completed','cancelled') then raise exception 'Reopen this task before assigning it.';end if;
  if v_member is null or v_member=current_task.assignee_id then raise exception 'Choose a different assignee.';end if;
  if current_task.review_required and v_member=current_task.reviewer_id then raise exception 'Choose an independent reviewer.';end if;
  perform 1 from public.profiles where id=v_member and workspace_id=actor.workspace_id and active for share;
  if not found then raise exception 'Select active members from your workspace.';end if;
  update public.assignment_requests set state='superseded',responded_at=now() where task_id=v_task and state='pending';
  -- Handover never replaces an existing owner until the recipient accepts.
  insert into public.assignment_requests(workspace_id,task_id,recipient_id,requester_id,state,responded_at)
   values(actor.workspace_id,v_task,v_member,actor.id,case when current_task.assignee_id is null and v_member=actor.id then 'accepted'::public.assignment_state else 'pending'::public.assignment_state end,
    case when current_task.assignee_id is null and v_member=actor.id then now() else null end);
  if current_task.assignee_id is null and v_member=actor.id then update public.tasks set assignee_id=actor.id,progress='to_do' where id=v_task;end if;
 elsif operation='withdraw' then
  if not editable then raise exception 'Only the creator, assignee or manager can withdraw a request.' using errcode='42501';end if;
  update public.assignment_requests set state='withdrawn',responded_at=now() where task_id=v_task and state='pending';
  if not found then raise exception 'No pending assignment request exists.';end if;
 else raise exception 'Unsupported task action' using errcode='22023';
 end if;
 update public.tasks set revision=revision+1 where id=v_task;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
  values(actor.workspace_id,actor.id,'task',v_task,'task.'||operation,jsonb_build_object('before',before_data,'after_status',case when operation='status' then p_input->>'status' else null end,'reason',v_reason,'member_id',v_member));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id) values(actor.id,v_request,'task.'||operation,v_task);
 return v_task;
end $$;

-- Keep existing acceptance behavior while clearing stale blocker/completion fields.
create function public.clear_task_completion_on_reopen() returns trigger language plpgsql set search_path='' as $$
begin
 if new.progress not in ('completed') then new.completed_at:=null;new.completed_by:=null;new.completion_notes:=null;end if;
 if new.progress<>'blocked' then new.blocker_reason:=null;end if;
 return new;
end $$;
create trigger task_progress_cleanup before update of progress on public.tasks for each row execute function public.clear_task_completion_on_reopen();

create function public.workspace_team_members() returns table(id uuid,display_name text,role public.workspace_role,active boolean,email text)
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;
begin
 select * into actor from public.profiles p where p.id=auth.uid() and p.active;
 if not found or actor.role<>'administrator' then raise exception 'Administrator access required' using errcode='42501';end if;
 return query select p.id,p.display_name,p.role,p.active,u.email::text from public.profiles p join auth.users u on u.id=p.id where p.workspace_id=actor.workspace_id order by p.display_name;
end $$;

create function public.manage_workspace_member(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles%rowtype; target public.profiles%rowtype; v_user uuid; ws uuid;
 operation text:=p_input->>'action'; v_role public.workspace_role := (p_input->>'role')::public.workspace_role;
 v_active boolean:=coalesce((p_input->>'active')::boolean,true); v_name text:=trim(coalesce(p_input->>'display_name',''));
 v_email text:=lower(trim(coalesce(p_input->>'email',''))); v_request uuid:=(p_input->>'request_id')::uuid;
 previous public.mutation_receipts%rowtype;
begin
 select workspace_id into ws from public.profiles where id=auth.uid() and active;
 if ws is null then raise exception 'Administrator access required' using errcode='42501';end if;
 -- Serialize membership changes before taking profile locks to avoid admin races.
 perform 1 from public.workspaces where id=ws for update;
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found or actor.role<>'administrator' then raise exception 'Administrator access required' using errcode='42501';end if;
 if v_request is null or v_role is null then raise exception 'Invalid member fields' using errcode='22023';end if;
 select * into previous from public.mutation_receipts where actor_id=actor.id and request_id=v_request;
 if found then
  if previous.action<>'member.'||operation then raise exception 'This request was already used for another action.';end if;
  return previous.entity_id;
 end if;
 if (select count(*) from public.audit_events where actor_id=actor.id and entity_type='profile' and created_at>now()-interval '1 minute')>=20 then raise exception 'Too many team changes. Wait a minute and retry.' using errcode='54000';end if;
 if operation='add' then
  if length(v_name) not between 1 and 150 or length(v_email) not between 3 and 254 then raise exception 'Invalid member fields' using errcode='22023';end if;
  select u.id into v_user from auth.users u where lower(u.email)=v_email;
  if v_user is null then raise exception 'Create this user in Supabase Authentication first, then add their email here.';end if;
  if exists(select 1 from public.profiles where profiles.id=v_user) then raise exception 'This account already has a workspace profile. Existing memberships are not moved or overwritten.';end if;
  insert into public.profiles(id,workspace_id,display_name,role,active) values(v_user,actor.workspace_id,v_name,v_role,true);
 elsif operation='update' then
  v_user:=(p_input->>'member_id')::uuid;
  select * into target from public.profiles where profiles.id=v_user and workspace_id=actor.workspace_id for update;
  if not found then raise exception 'Workspace member not found' using errcode='42501';end if;
  if v_user=actor.id and (v_role<>actor.role or not v_active) then raise exception 'You cannot remove your own administrator access.';end if;
  if target.role='administrator' and target.active and (v_role<>'administrator' or not v_active)
   and (select count(*) from public.profiles where workspace_id=actor.workspace_id and role='administrator' and active)<=1 then raise exception 'Keep at least one active administrator.';end if;
  update public.profiles set role=v_role,active=v_active where profiles.id=v_user;
 else raise exception 'Unsupported member action' using errcode='22023';end if;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
  values(actor.workspace_id,actor.id,'profile',v_user,'member.'||operation,jsonb_build_object('previous_role',target.role,'previous_active',target.active,'role',v_role,'active',case when operation='add' then true else v_active end));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id) values(actor.id,v_request,'member.'||operation,v_user);
 return v_user;
end $$;

create function public.mark_workspace_notifications(p_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.notifications set read_at=now() where recipient_id=auth.uid() and public.is_workspace_member(workspace_id) and read_at is null and (p_id is null or id=p_id);
end $$;
revoke all on function public.mutate_workspace_task(jsonb) from public,anon,authenticated;
revoke all on function public.workspace_team_members() from public,anon,authenticated;
revoke all on function public.manage_workspace_member(jsonb) from public,anon,authenticated;
revoke all on function public.mark_workspace_notifications(uuid) from public,anon,authenticated;
grant execute on function public.mutate_workspace_task(jsonb) to authenticated;
grant execute on function public.workspace_team_members() to authenticated;
grant execute on function public.manage_workspace_member(jsonb) to authenticated;
grant execute on function public.mark_workspace_notifications(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
