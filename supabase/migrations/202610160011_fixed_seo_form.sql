-- Apply after 001–010. One fixed website-health form; no template publication needed.
begin;
create table public.website_seo_profiles(
 workspace_id uuid not null,website_id uuid primary key,fields jsonb not null default '{}',notes jsonb not null default '{}',
 source text not null default '',revision integer not null default 1,updated_by uuid not null,updated_at timestamptz not null default now(),
 foreign key(workspace_id,website_id) references public.websites(workspace_id,id),foreign key(workspace_id,updated_by) references public.profiles(workspace_id,id)
);
create table public.website_seo_revisions(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,website_id uuid not null,revision integer not null,
 fields jsonb not null,notes jsonb not null,source text not null,reason text,actor_id uuid not null,created_at timestamptz not null default now(),
 unique(website_id,revision),foreign key(workspace_id,website_id) references public.websites(workspace_id,id),foreign key(workspace_id,actor_id) references public.profiles(workspace_id,id)
);
create table public.website_seo_audits(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,website_id uuid not null,measurement_date date not null,
 score numeric not null check(score between 0 and 100),source text not null check(length(trim(source)) between 1 and 500),
 supersedes_id uuid unique references public.website_seo_audits(id),reason text,actor_id uuid not null,created_at timestamptz not null default now(),
 foreign key(workspace_id,website_id) references public.websites(workspace_id,id),foreign key(workspace_id,actor_id) references public.profiles(workspace_id,id)
);
create index seo_audit_dates on public.website_seo_audits(workspace_id,website_id,measurement_date desc);
create table public.website_seo_imports(workspace_id uuid not null references public.workspaces(id),source_key text not null,source_data jsonb not null,actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),primary key(workspace_id,source_key));
do $$ declare relation text;begin
 foreach relation in array array['website_seo_profiles','website_seo_revisions','website_seo_audits','website_seo_imports'] loop
  execute format('alter table public.%I enable row level security',relation);
  execute format('create policy workspace_read on public.%I for select to authenticated using(public.is_workspace_member(workspace_id))',relation);
  execute format('revoke all on public.%I from anon,authenticated',relation);
  execute format('grant select on public.%I to authenticated',relation);
 end loop;
end $$;
create trigger immutable_seo_revisions before update or delete on public.website_seo_revisions for each row execute function public.reject_immutable_mutation();
create trigger immutable_seo_audits before update or delete on public.website_seo_audits for each row execute function public.reject_immutable_mutation();
create trigger immutable_seo_imports before update or delete on public.website_seo_imports for each row execute function public.reject_immutable_mutation();

create function public.fixed_seo_fields() returns jsonb language sql immutable set search_path='' as $$ select '[{"group":"Website information","key":"website_url","label":"Website URL","type":"url"},{"group":"Website information","key":"cms","label":"CMS Platform","type":"text"},{"group":"SEO & performance","key":"seo_implementation","label":"SEO Implementation","type":"status"},{"group":"SEO & performance","key":"seo_score","label":"SEO Rating","type":"number"},{"group":"SEO & performance","key":"audit_date","label":"Last SEO Audit Date","type":"date"},{"group":"SEO & performance","key":"google_analytics","label":"Google Analytics","type":"status"},{"group":"SEO & performance","key":"page_seconds","label":"Page Speed Score","type":"duration"},{"group":"Donation & CRM","key":"donation_crm","label":"Donation CRM","type":"text"},{"group":"Donation & CRM","key":"donation_checkout","label":"Donation Checkout","type":"text"},{"group":"Donation & CRM","key":"recurring_donations","label":"Recurring Donations","type":"status"},{"group":"Donation & CRM","key":"currency","label":"Currency Supported","type":"text"},{"group":"Events & ticketing","key":"event_platform","label":"Event Ticketing Platform","type":"text"},{"group":"Email marketing","key":"mailchimp","label":"Mailchimp Embedded","type":"status"},{"group":"Content","key":"blogs","label":"Blogs","type":"status"},{"group":"Content","key":"news","label":"News Articles","type":"status"},{"group":"Content","key":"financial_reports","label":"Financial Reports","type":"status"},{"group":"Content","key":"impact_reports","label":"Impact Reports","type":"status"},{"group":"Content","key":"directors","label":"Directors Information","type":"status"},{"group":"Content","key":"newsletter","label":"Newsletter/Email Signup","type":"status"},{"group":"Content","key":"video","label":"Video Content","type":"status"},{"group":"Security & compliance","key":"security_plugins","label":"Security Plugins Installed","type":"status"},{"group":"Security & compliance","key":"ssl","label":"SSL Certificate","type":"status"},{"group":"Security & compliance","key":"privacy","label":"GDPR / Privacy Policy","type":"status"},{"group":"Security & compliance","key":"captcha","label":"Chatbot / Captcha in Forms","type":"status"},{"group":"Maintenance & QA","key":"qa","label":"Website QA","type":"text"},{"group":"Maintenance & QA","key":"plugin_updated","label":"Last Plugin Update","type":"date"},{"group":"Maintenance & QA","key":"backup_date","label":"Backup Status (Server)","type":"date"},{"group":"Social media","key":"facebook","label":"Facebook","type":"status"},{"group":"Social media","key":"instagram","label":"Instagram","type":"status"},{"group":"Social media","key":"linkedin","label":"LinkedIn","type":"status"},{"group":"Social media","key":"twitter","label":"Twitter / X","type":"status"},{"group":"Social media","key":"youtube","label":"YouTube","type":"status"},{"group":"Notes","key":"remarks","label":"General Notes / Remarks","type":"long_text"}]'::jsonb $$;
create function public.validate_fixed_seo(p_fields jsonb,p_notes jsonb) returns void language plpgsql immutable set search_path='' as $$
declare f jsonb;k text;v jsonb;t text;note text;
begin
 if jsonb_typeof(p_fields) is distinct from 'object' or jsonb_typeof(p_notes) is distinct from 'object' or length(p_fields::text)>60000 or length(p_notes::text)>30000 then raise exception 'Invalid SEO form';end if;
 for k in select jsonb_object_keys(p_fields) union select jsonb_object_keys(p_notes) loop
  if not exists(select 1 from jsonb_array_elements(public.fixed_seo_fields()) spec where spec->>'key'=k) then raise exception 'Unknown SEO field';end if;
 end loop;
 for f in select value from jsonb_array_elements(public.fixed_seo_fields()) loop
  k:=f->>'key';t:=f->>'type';v:=p_fields->k;
  if v is null or v='null' or v='""' then continue;end if;
  if t in ('number','duration') then
   if jsonb_typeof(v)<>'number' then raise exception 'Invalid numeric SEO field';end if;
   if (v#>>'{}')::numeric<0 or (v#>>'{}')::numeric>(case when t='number' then 100 else 3600 end) then raise exception 'Numeric SEO field out of range';end if;
  else
   if jsonb_typeof(v)<>'string' or length(v#>>'{}')>5000 or (v#>>'{}')~*'(-----BEGIN .*PRIVATE KEY|[?&](password|token|api_key)=)' then raise exception 'Invalid or unsafe SEO text';end if;
   if t='status' and (v#>>'{}') not in ('unknown','yes','no','in_progress','not_yet','not_applicable') then raise exception 'Invalid checklist status';end if;
   if t='date' then
    if (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid SEO date';end if;
    perform (v#>>'{}')::date;
   end if;
  end if;
 end loop;
 for k,note in select key,value from jsonb_each_text(p_notes) loop
  if jsonb_typeof(p_notes->k)<>'string' or length(note)>2000 then raise exception 'Invalid field note';end if;
 end loop;
 if nullif(p_fields->>'seo_score','') is not null and nullif(p_fields->>'audit_date','') is null then raise exception 'A score requires an audit date';end if;
end $$;

create function public.append_fixed_seo_audit(p_workspace uuid,p_site uuid,p_date date,p_score numeric,p_source text,p_actor uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare previous public.website_seo_audits%rowtype;v_id uuid;
begin
 select a.* into previous from public.website_seo_audits a where a.workspace_id=p_workspace and a.website_id=p_site and a.measurement_date=p_date and a.source=p_source
 and not exists(select 1 from public.website_seo_audits newer where newer.supersedes_id=a.id) order by a.created_at desc limit 1;
 if found then
  if previous.score=p_score then return previous.id;end if;
  if previous.actor_id<>p_actor and not exists(select 1 from public.profiles where id=p_actor and workspace_id=p_workspace and active and role='administrator') then raise exception 'Only the audit author or an administrator can correct this audit' using errcode='42501';end if;
  if coalesce(length(trim(p_reason)),0)=0 then raise exception 'Correcting an existing audit requires a reason';end if;
 end if;
 insert into public.website_seo_audits(workspace_id,website_id,measurement_date,score,source,supersedes_id,reason,actor_id)
 values(p_workspace,p_site,p_date,p_score,p_source,previous.id,nullif(p_reason,''),p_actor) returning id into v_id;
 return v_id;
end $$;

create function public.save_fixed_seo(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;site public.websites%rowtype;profile public.website_seo_profiles%rowtype;r public.mutation_receipts%rowtype;
 req uuid:=(p_input->>'request_id')::uuid;v_site uuid:=(p_input->>'website_id')::uuid;next_revision integer;
 fields_value jsonb:=p_input->'fields';notes_value jsonb:=p_input->'notes';source_value text:=trim(coalesce(p_input->>'source',''));reason_value text:=trim(coalesce(p_input->>'reason',''));
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if req is null or v_site is null or length(source_value)>500 or length(reason_value)>2000 then raise exception 'Invalid SEO request';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||req::text,0));
 select * into r from public.mutation_receipts where actor_id=actor.id and request_id=req;
 if found then
  if r.action<>'seo.save' or r.entity_id<>v_site or r.payload_hash is distinct from md5(p_input::text) then raise exception 'Request already saved with different values';end if;return r.entity_id;
 end if;
 select * into site from public.websites where id=v_site and workspace_id=actor.workspace_id for update;
 if not found then raise exception 'Website not found' using errcode='42501';end if;
 if site.archived_at is not null or site.status='archived' then raise exception 'Restore this website before updating SEO';end if;
 select * into profile from public.website_seo_profiles where website_id=v_site;
 if (p_input->>'expected_revision')::integer is distinct from coalesce(profile.revision,0) then raise exception 'SEO form changed; reload before saving' using errcode='40001';end if;
 perform public.validate_fixed_seo(fields_value,notes_value);
 -- Registry identity remains managed through the existing role-checked website editor.
 fields_value:=fields_value||jsonb_build_object('website_url',site.canonical_url,'cms',coalesce(site.cms,''));
 if nullif(fields_value->>'seo_score','') is not null then
  if length(source_value)=0 then raise exception 'A score requires its source';end if;
  perform public.append_fixed_seo_audit(actor.workspace_id,v_site,(fields_value->>'audit_date')::date,(fields_value->>'seo_score')::numeric,source_value,actor.id,reason_value);
 end if;
 next_revision:=coalesce(profile.revision,0)+1;
 insert into public.website_seo_profiles(workspace_id,website_id,fields,notes,source,revision,updated_by) values(actor.workspace_id,v_site,fields_value,notes_value,source_value,next_revision,actor.id)
 on conflict(website_id) do update set fields=excluded.fields,notes=excluded.notes,source=excluded.source,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 insert into public.website_seo_revisions(workspace_id,website_id,revision,fields,notes,source,reason,actor_id) values(actor.workspace_id,v_site,next_revision,fields_value,notes_value,source_value,nullif(reason_value,''),actor.id);
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata) values(actor.workspace_id,actor.id,'website',v_site,'seo.saved',jsonb_build_object('revision',next_revision,'reason',reason_value));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id,payload_hash) values(actor.id,req,'seo.save',v_site,md5(p_input::text));
 return v_site;
end $$;

revoke all on function public.fixed_seo_fields(),public.validate_fixed_seo(jsonb,jsonb),public.append_fixed_seo_audit(uuid,uuid,date,numeric,text,uuid,text),public.save_fixed_seo(jsonb) from public,anon,authenticated;
grant execute on function public.save_fixed_seo(jsonb) to authenticated;

create function public.fixed_seo_catalog(p_site uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare actor public.profiles%rowtype;result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if p_site is not null and not exists(select 1 from public.websites where id=p_site and workspace_id=actor.workspace_id) then raise exception 'Website not found' using errcode='42501';end if;
 select jsonb_build_object('websites',coalesce((select jsonb_agg(to_jsonb(x) order by name) from (
 select w.id,w.name,w.country,w.canonical_url,w.cms,w.archived_at,w.status,coalesce(p.fields,'{}') as fields,coalesce(p.notes,'{}') as notes,coalesce(p.source,'') as source,coalesce(p.revision,0) as revision,p.updated_at,
 (select to_jsonb(a) from public.website_seo_audits a where a.website_id=w.id and not exists(select 1 from public.website_seo_audits n where n.supersedes_id=a.id) order by measurement_date desc,created_at desc,id limit 1) as latest_audit
 from public.websites w left join public.website_seo_profiles p on p.website_id=w.id and p.workspace_id=w.workspace_id where w.workspace_id=actor.workspace_id and (p_site is null or w.id=p_site)) x),'[]'),
 'audits',coalesce((select jsonb_agg(to_jsonb(x) order by measurement_date desc,created_at desc) from (select a.* from public.website_seo_audits a where a.workspace_id=actor.workspace_id and a.website_id=p_site order by measurement_date desc,created_at desc limit 100) x),'[]'),
 'revisions',coalesce((select jsonb_agg(to_jsonb(x) order by revision desc) from (select * from public.website_seo_revisions where workspace_id=actor.workspace_id and website_id=p_site order by revision desc limit 30) x),'[]')) into result;
 return result;
end $$;

create function public.import_fixed_seo(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;row_value jsonb;a jsonb;site public.websites%rowtype;v_id uuid;key_value text;profiles_added integer:=0;audits_added integer:=0;sites_added integer:=0;audits_before integer;skipped integer:=0;conflicts integer:=0;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found or actor.role<>'administrator' then raise exception 'Administrator required' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>50 or length(p_rows::text)>500000 then raise exception 'Invalid source import';end if;
 perform 1 from public.workspaces where id=actor.workspace_id for update;
 select count(*) into audits_before from public.website_seo_audits where workspace_id=actor.workspace_id;
 for row_value in select value from jsonb_array_elements(p_rows) loop
  key_value:=row_value->>'source_key';
  if coalesce(length(key_value),0) not between 1 and 1000 then raise exception 'Missing source identity';end if;
  if exists(select 1 from public.website_seo_imports where workspace_id=actor.workspace_id and source_key=key_value) then skipped:=skipped+1;continue;end if;
  select * into site from public.websites where workspace_id=actor.workspace_id and canonical_url=row_value->>'url' for update;
  if not found then
   v_id:=public.create_workspace_website(jsonb_build_object('request_id',gen_random_uuid(),'name',row_value->>'name','country',row_value->>'country','url',row_value->>'url','cms',row_value->>'cms'));
   select * into site from public.websites where id=v_id;sites_added:=sites_added+1;
  end if;
  if site.archived_at is not null or site.status='archived' then conflicts:=conflicts+1;continue;end if;
  if not exists(select 1 from public.website_seo_profiles where website_id=site.id) then
   perform public.save_fixed_seo(jsonb_build_object('request_id',gen_random_uuid(),'website_id',site.id,'expected_revision',0,'fields',row_value->'fields','notes',row_value->'notes','source','Rank Math SEO Analyzer','reason','Initial source-sheet import'));
   profiles_added:=profiles_added+1;
  else conflicts:=conflicts+1;
  end if;
  for a in select value from jsonb_array_elements(row_value->'audits') loop
   if exists(select 1 from public.website_seo_audits where website_id=site.id and measurement_date=(a->>'measurement_date')::date and source='Rank Math SEO Analyzer' and score<>(a->>'score')::numeric and not exists(select 1 from public.website_seo_audits newer where newer.supersedes_id=website_seo_audits.id)) then conflicts:=conflicts+1;continue;end if;
   if not exists(select 1 from public.website_seo_audits where website_id=site.id and measurement_date=(a->>'measurement_date')::date and source='Rank Math SEO Analyzer') then
    perform public.append_fixed_seo_audit(actor.workspace_id,site.id,(a->>'measurement_date')::date,(a->>'score')::numeric,'Rank Math SEO Analyzer',actor.id,'Imported historical audit; original auditor unspecified');audits_added:=audits_added+1;
   end if;
  end loop;
  insert into public.website_seo_imports(workspace_id,source_key,source_data,actor_id) values(actor.workspace_id,key_value,row_value,actor.id);
 end loop;
 select count(*)-audits_before into audits_added from public.website_seo_audits where workspace_id=actor.workspace_id;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata) values(actor.workspace_id,actor.id,'seo_import',actor.workspace_id,'seo.imported',jsonb_build_object('websites_added',sites_added,'profiles_added',profiles_added,'historical_audits_added',audits_added,'conflicts',conflicts,'skipped',skipped));
 return jsonb_build_object('websites_added',sites_added,'profiles_added',profiles_added,'historical_audits_added',audits_added,'conflicts',conflicts,'skipped',skipped);
end $$;
revoke all on function public.fixed_seo_catalog(uuid),public.import_fixed_seo(jsonb) from public,anon,authenticated;
grant execute on function public.fixed_seo_catalog(uuid),public.import_fixed_seo(jsonb) to authenticated;

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

notify pgrst,'reload schema';
commit;
