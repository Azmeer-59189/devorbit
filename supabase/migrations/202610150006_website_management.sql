-- Apply after 001–005. Preserve linked records when archiving websites.
begin;
alter table public.websites add column revision integer not null default 1;
create function public.manage_workspace_website(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;site public.websites%rowtype;receipt public.mutation_receipts%rowtype;
 v_request uuid:=(p_input->>'request_id')::uuid;v_id uuid:=(p_input->>'website_id')::uuid;
 operation text:=p_input->>'action';v_name text:=trim(p_input->>'name');v_country text:=trim(p_input->>'country');
 v_url text:=trim(p_input->>'url');v_cms text:=trim(coalesce(p_input->>'cms',''));v_status text:=p_input->>'status';
 config jsonb:=p_input->'configuration';k text;v text;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found or actor.role not in ('administrator','manager') then raise exception 'Website management requires a manager or administrator.' using errcode='42501';end if;
 if v_request is null or v_id is null or operation is null or operation not in ('save','archive','restore') then raise exception 'Invalid website action.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||v_request::text,0));
 select * into receipt from public.mutation_receipts where actor_id=actor.id and request_id=v_request;
 if found then
  if receipt.action is distinct from 'website.'||operation or receipt.entity_id<>v_id or receipt.payload_hash is distinct from md5(p_input::text) then raise exception 'Request already saved with different values.';end if;
  return receipt.entity_id;
 end if;
 select * into site from public.websites where id=v_id and workspace_id=actor.workspace_id for update;
 if not found then raise exception 'Website not found' using errcode='42501';end if;
 if (p_input->>'expected_revision')::integer is distinct from site.revision then raise exception 'Website changed; refresh before saving.' using errcode='40001';end if;
 if operation='save' then
  if site.archived_at is not null or site.status='archived' then raise exception 'Restore this website before editing.';end if;
  if coalesce(length(v_name),0) not between 1 and 150 or coalesce(length(v_country),0) not between 1 and 100
   or coalesce(length(v_url),0) not between 8 and 2048 or length(v_cms)>100
   or v_url !~ '^https?://[^/?#[:space:]@]+(:[0-9]+)?(/[^?#[:space:]]*)?$'
   or v_status is null or v_status not in ('active','maintenance','needs_attention','inactive') then raise exception 'Invalid website fields.' using errcode='22023';end if;
  if jsonb_typeof(config) is distinct from 'object' or length(config::text)>12000 then raise exception 'Invalid website configuration.';end if;
  for k,v in select key,value from jsonb_each_text(config) loop
   if k not in ('hosting','domain_registrar','crm','analytics','notes') or jsonb_typeof(config->k)<>'string' or length(v)>2000
    or v~*'(-----BEGIN .*PRIVATE KEY|[?&](api_key|token|password)=)' then raise exception 'Use supported configuration fields without credentials.';end if;
  end loop;
  v_url:=regexp_replace(v_url,'^([^:]+://)([^/]+)', '\1'||lower(substring(v_url from '^https?://([^/]+)')));
  v_url:=regexp_replace(v_url,'/$','');
  update public.websites set name=v_name,country=v_country,canonical_url=v_url,cms=v_cms,status=v_status,
   configuration=configuration||config,revision=revision+1 where id=v_id;
 elsif operation='archive' then
  update public.websites set status='archived',archived_at=coalesce(archived_at,now()),revision=revision+1 where id=v_id;
 else
  if site.archived_at is null and site.status<>'archived' then raise exception 'Website is already active.';end if;
  update public.websites set status='active',archived_at=null,revision=revision+1 where id=v_id;
 end if;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
  values(actor.workspace_id,actor.id,'website',v_id,'website.'||operation,jsonb_build_object('previous_revision',site.revision,'previous_status',site.status,'previous_name',site.name,'previous_configuration',site.configuration));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id,payload_hash) values(actor.id,v_request,'website.'||operation,v_id,md5(p_input::text));
 return v_id;
end $$;
revoke all on function public.manage_workspace_website(jsonb) from public,anon,authenticated;
grant execute on function public.manage_workspace_website(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
