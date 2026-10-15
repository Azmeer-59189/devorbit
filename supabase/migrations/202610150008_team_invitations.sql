-- Apply after 001–007. Authenticated email identity, never link parameters, grants membership.
begin;
create table public.workspace_invitations (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 email text not null,display_name text not null,role public.workspace_role not null,
 invited_by uuid not null references public.profiles(id),state text not null default 'pending' check(state in ('pending','accepted','cancelled')),
 delivery_status text not null default 'queued' check(delivery_status in ('queued','sent','failed')),
 send_request_id uuid not null,last_sent_at timestamptz not null default now(),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',accepted_by uuid references public.profiles(id),accepted_at timestamptz
);
create unique index one_pending_workspace_invitation on public.workspace_invitations(workspace_id,email) where state='pending';
alter table public.workspace_invitations enable row level security;
create policy administrator_read on public.workspace_invitations for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.workspace_id=workspace_invitations.workspace_id and p.active and p.role='administrator'));
revoke all on public.workspace_invitations from anon,authenticated;
grant select on public.workspace_invitations to authenticated;
create table public.invitation_dispatches(request_id uuid primary key,invitation_id uuid not null references public.workspace_invitations(id),workspace_id uuid not null references public.workspaces(id),created_at timestamptz not null default now());
alter table public.invitation_dispatches enable row level security;
revoke all on public.invitation_dispatches from anon,authenticated;
create index invitation_dispatch_rate on public.invitation_dispatches(workspace_id,created_at);

create function public.manage_workspace_invitation(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;i public.workspace_invitations%rowtype;r public.mutation_receipts%rowtype;
 req uuid:=(p_input->>'request_id')::uuid;v_id uuid:=nullif(p_input->>'invitation_id','')::uuid;operation text:=p_input->>'action';
 v_email text:=lower(trim(p_input->>'email'));v_name text:=trim(p_input->>'display_name');v_role public.workspace_role;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found or actor.role<>'administrator' then raise exception 'Administrator access required' using errcode='42501';end if;
 if req is null or operation is null or operation not in ('invite','resend','cancel') then raise exception 'Invalid invitation action';end if;
 perform 1 from public.workspaces where id=actor.workspace_id for update;
 select * into r from public.mutation_receipts where actor_id=actor.id and request_id=req;
 if found then
  if r.action<>'invitation.'||operation or r.payload_hash is distinct from md5(p_input::text) then raise exception 'Request already used with different values';end if;
  return jsonb_build_object('id',r.entity_id,'should_send',false);
 end if;
 if operation='invite' then
  v_role:=(p_input->>'role')::public.workspace_role;
  if coalesce(length(v_name),0) not between 1 and 150 or coalesce(length(v_email),0) not between 3 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_role is null then raise exception 'Invalid invitation fields';end if;
  if exists(select 1 from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=v_email) then raise exception 'This email already has workspace membership.' using errcode='23505';end if;
  insert into public.workspace_invitations(workspace_id,email,display_name,role,invited_by,send_request_id)
   values(actor.workspace_id,v_email,v_name,v_role,actor.id,req) returning * into i;
 else
  select * into i from public.workspace_invitations where id=v_id and workspace_id=actor.workspace_id for update;
  if not found then raise exception 'Invitation not found' using errcode='42501';end if;
  if i.state<>'pending' then raise exception 'This invitation is no longer pending.';end if;
  if operation='cancel' then update public.workspace_invitations set state='cancelled' where id=i.id;
  else
   if i.last_sent_at>now()-interval '60 seconds' then raise exception 'Wait at least one minute before resending.' using errcode='54000';end if;
   update public.workspace_invitations set expires_at=now()+interval '7 days',last_sent_at=now(),send_request_id=req,delivery_status='queued' where id=i.id returning * into i;
  end if;
 end if;
 if operation<>'cancel' then
  if (select count(*) from public.invitation_dispatches where workspace_id=actor.workspace_id and created_at>now()-interval '1 hour')>=20 then raise exception 'Invitation limit reached. Try again later.' using errcode='54000';end if;
  insert into public.invitation_dispatches(request_id,invitation_id,workspace_id) values(req,i.id,actor.workspace_id);
 end if;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata) values(actor.workspace_id,actor.id,'invitation',i.id,'invitation.'||operation,jsonb_build_object('role',i.role));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id,payload_hash) values(actor.id,req,'invitation.'||operation,i.id,md5(p_input::text));
 return jsonb_build_object('id',i.id,'email',i.email,'should_send',operation<>'cancel');
end $$;

create function public.record_invitation_delivery(p_id uuid,p_request uuid,p_sent boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.workspace_invitations i set delivery_status=case when p_sent then 'sent' else 'failed' end
 where i.id=p_id and i.send_request_id=p_request and i.state='pending' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.workspace_id=i.workspace_id and p.active and p.role='administrator');
end $$;

create function public.my_workspace_invitation(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('id',i.id,'display_name',i.display_name,'role',i.role,'workspace',w.name,'email',i.email,'state',case when i.state='pending' and i.expires_at<=now() then 'expired' else i.state end)
 into result from public.workspace_invitations i join public.workspaces w on w.id=i.workspace_id
 join auth.users u on u.id=auth.uid() and lower(u.email)=i.email and u.email_confirmed_at is not null where i.id=p_id;
 if result is null then raise exception 'Sign in with the verified email that received this invitation.' using errcode='42501';end if;
 return result;
end $$;

create function public.accept_workspace_invitation(p_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.workspace_invitations%rowtype;u auth.users%rowtype;p public.profiles%rowtype;ws uuid;
begin
 select * into u from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if not found then raise exception 'A verified email session is required.' using errcode='42501';end if;
 select workspace_id into ws from public.workspace_invitations where id=p_id and email=lower(u.email);
 if ws is null then raise exception 'Invitation not found for this account.' using errcode='42501';end if;
 perform 1 from public.workspaces where id=ws for update;
 select * into i from public.workspace_invitations where id=p_id for update;
 if i.state='accepted' and i.accepted_by=u.id then
  select * into p from public.profiles where id=u.id and workspace_id=i.workspace_id and active;
  if found then return p.id;end if;
  raise exception 'Contact your administrator to restore workspace access.' using errcode='42501';
 end if;
 if i.state<>'pending' or i.expires_at<=now() then raise exception 'This invitation is cancelled or expired.' using errcode='42501';end if;
 perform 1 from public.profiles where id=i.invited_by and workspace_id=i.workspace_id and active and role='administrator' for share;
 if not found then raise exception 'Ask an active administrator for a new invitation.' using errcode='42501';end if;
 if exists(select 1 from public.profiles where id=u.id) then raise exception 'This account already has workspace membership.' using errcode='23505';end if;
 insert into public.profiles(id,workspace_id,display_name,role) values(u.id,i.workspace_id,i.display_name,i.role);
 update public.workspace_invitations set state='accepted',accepted_by=u.id,accepted_at=now() where id=i.id;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata) values(i.workspace_id,u.id,'invitation',i.id,'invitation.accepted',jsonb_build_object('invited_by',i.invited_by,'role',i.role));
 return u.id;
end $$;
revoke all on function public.manage_workspace_invitation(jsonb),public.record_invitation_delivery(uuid,uuid,boolean),public.my_workspace_invitation(uuid),public.accept_workspace_invitation(uuid) from public,anon,authenticated;
grant execute on function public.manage_workspace_invitation(jsonb),public.record_invitation_delivery(uuid,uuid,boolean),public.my_workspace_invitation(uuid),public.accept_workspace_invitation(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
