-- Apply after 001–004. Published schemas, revisions and measurements stay immutable.
begin;
alter table public.form_templates add column description text not null default '';
alter table public.form_templates add column type text not null default 'custom' check(type in ('seo','maintenance','website_update','custom'));
alter table public.form_templates add column draft_website_ids jsonb not null default '[]';
alter table public.form_templates add column draft_revision integer not null default 1;
alter table public.form_templates add column published_draft_revision integer;
alter table public.form_template_versions add column title text not null default '';
alter table public.form_template_versions add column description text not null default '';
alter table public.form_template_versions add column type text not null default 'custom';
alter table public.form_template_versions add constraint template_version_identity unique(workspace_id,template_id,id);
alter table public.report_submissions add constraint submission_template_version_match foreign key(workspace_id,template_id,template_version_id) references public.form_template_versions(workspace_id,template_id,id);
alter table public.report_revisions add constraint report_revision_workspace_identity unique(workspace_id,submission_id,id);
alter table public.report_submissions add column current_revision_id uuid;
alter table public.report_submissions add constraint current_revision_match foreign key(workspace_id,id,current_revision_id) references public.report_revisions(workspace_id,submission_id,id);
update public.report_submissions s set current_revision_id=(select r.id from public.report_revisions r where r.submission_id=s.id order by r.revision_number desc limit 1);
create table public.form_template_websites (
 workspace_id uuid not null,template_id uuid not null,website_id uuid not null,primary key(template_id,website_id),
 foreign key(workspace_id,template_id) references public.form_templates(workspace_id,id),
 foreign key(workspace_id,website_id) references public.websites(workspace_id,id)
);
create table public.metric_observations (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,website_id uuid not null,
 submission_id uuid not null,report_revision_id uuid not null,metric_key text not null check(metric_key='seo_score'),
 value numeric not null check(value between 0 and 100),unit text not null default 'score',scale numeric not null default 100 check(scale=100),
 source text not null check(length(trim(source))>0),measured_at date not null,
 unique(report_revision_id,metric_key),
 foreign key(workspace_id,website_id) references public.websites(workspace_id,id),
 foreign key(workspace_id,submission_id,report_revision_id) references public.report_revisions(workspace_id,submission_id,id)
);
create trigger immutable_metric_observations before update or delete on public.metric_observations for each row execute function public.reject_immutable_mutation();
do $$ declare relation text;begin
 foreach relation in array array['form_template_websites','metric_observations'] loop
  execute format('alter table public.%I enable row level security',relation);
  execute format('create policy workspace_read on public.%I for select to authenticated using(public.is_workspace_member(workspace_id))',relation);
  execute format('revoke all on public.%I from anon,authenticated',relation);
  execute format('grant select on public.%I to authenticated',relation);
 end loop;
end $$;
grant select on public.form_templates,public.form_template_versions,public.report_submissions,public.report_revisions to authenticated;
create index reports_workspace_period on public.report_submissions(workspace_id,period_start desc);
create index metrics_workspace_site on public.metric_observations(workspace_id,website_id,measured_at);

create function public.validate_reporting_fields(p_fields jsonb,p_publish boolean default false) returns void
language plpgsql immutable set search_path='' as $$
declare f jsonb;k text;t text;keys text[]:='{}';opt text;seen text[];metric boolean:=false;
begin
 if jsonb_typeof(p_fields) is distinct from 'array' or jsonb_array_length(p_fields)>50 or (p_publish and jsonb_array_length(p_fields)=0) then raise exception 'Use 1–50 fields when publishing.';end if;
 for f in select value from jsonb_array_elements(p_fields) loop
  k:=f->>'key';t:=f->>'type';
  if k is null or k !~ '^[a-z][a-z0-9_]{0,49}$' or k=any(keys) or coalesce(length(trim(f->>'label')),0) not between 1 and 120 or length(coalesce(f->>'help',''))>500
   or (k||' '||coalesce(f->>'label','')||' '||coalesce(f->>'help',''))~*'(password|passwd|secret|token|credential|api[ _-]?key|private[ _-]?key|card[ _-]?number|cvv)'
   or t is null or t not in ('short_text','long_text','integer','decimal','date','url','dropdown','multi_select','checkbox')
   or jsonb_typeof(f->'required') is distinct from 'boolean' then raise exception 'Invalid or unsafe field definition.';end if;
  keys:=array_append(keys,k);
  if t in ('dropdown','multi_select') then
   if jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options') not between 1 and 50 then raise exception 'Selection fields require options.';end if;
   seen:='{}';
   for opt in select value #>> '{}' from jsonb_array_elements(f->'options') loop
    if length(trim(opt)) not between 1 and 120 or opt<>trim(opt) or opt=any(seen) then raise exception 'Invalid or duplicate field options.';end if;
    seen:=array_append(seen,opt);
   end loop;
   if exists(select 1 from jsonb_array_elements(f->'options') v where jsonb_typeof(v)<>'string') then raise exception 'Field options must be text.';end if;
  end if;
  if f?'min' and (t not in ('integer','decimal') or jsonb_typeof(f->'min')<>'number') then raise exception 'Invalid numeric bounds.';end if;
  if f?'max' and (t not in ('integer','decimal') or jsonb_typeof(f->'max')<>'number') then raise exception 'Invalid numeric bounds.';end if;
  if f?'min' and f?'max' and (f->>'min')::numeric>(f->>'max')::numeric then raise exception 'Invalid numeric bounds.';end if;
  if f?'max_length' then
   if t not in ('short_text','long_text','url') or jsonb_typeof(f->'max_length')<>'number' or (f->>'max_length')::numeric<>trunc((f->>'max_length')::numeric) or (f->>'max_length')::numeric not between 1 and 5000 then raise exception 'Invalid text length.';end if;
  end if;
  if f?'metric_key' then
   if (f->>'metric_key') is distinct from 'seo_score' or k<>'seo_score' or t not in ('integer','decimal') or (f->>'min')::numeric is distinct from 0::numeric or (f->>'max')::numeric is distinct from 100::numeric then raise exception 'Only standardized SEO score metrics are supported.';end if;
   metric:=true;
  end if;
 end loop;
 if metric and (not exists(select 1 from jsonb_array_elements(p_fields) v where v->>'key'='source' and v->>'type'='short_text' and v->'required'='true')
  or not exists(select 1 from jsonb_array_elements(p_fields) v where v->>'key'='measurement_date' and v->>'type'='date' and v->'required'='true')
  or not exists(select 1 from jsonb_array_elements(p_fields) v where v->>'key'='scale' and v->>'type'='dropdown' and v->'required'='true' and v->'options'='["0–100"]')) then
  raise exception 'SEO fields require source, measurement_date and the 0–100 scale.';
 end if;
end $$;

create function public.validate_reporting_answers(p_fields jsonb,p_answers jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare f jsonb;v jsonb;k text;t text;s text;opt text;n numeric;empty boolean;
begin
 if jsonb_typeof(p_answers) is distinct from 'object' or length(p_answers::text)>50000 then raise exception 'Invalid report answers.';end if;
 if exists(select 1 from jsonb_object_keys(p_answers) a where not exists(select 1 from jsonb_array_elements(p_fields) schema_field where schema_field->>'key'=a)) then raise exception 'Answers contain unknown fields.';end if;
 for f in select value from jsonb_array_elements(p_fields) loop
  k:=f->>'key';t:=f->>'type';v:=p_answers->k;s:=v #>> '{}';
  empty:=v is null or v='null' or v='""' or v='[]';
  if empty then if (f->>'required')::boolean then raise exception 'A required answer is missing: %',k;end if;continue;end if;
  if t in ('short_text','long_text','date','url','dropdown') then
   if jsonb_typeof(v)<>'string' or length(s)>coalesce((f->>'max_length')::integer,case when t='long_text' then 5000 when t='url' then 2048 else 500 end) or ((f->>'required')::boolean and length(trim(s))=0) then raise exception 'Invalid text answer: %',k;end if;
  end if;
  if t in ('integer','decimal') then
   if jsonb_typeof(v)<>'number' then raise exception 'A numeric answer is required: %',k;end if;
   n:=s::numeric;if (t='integer' and n<>trunc(n)) or (f?'min' and n<(f->>'min')::numeric) or (f?'max' and n>(f->>'max')::numeric) then raise exception 'Numeric answer is out of range: %',k;end if;
  elsif t='date' then
   if s !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date answer: %',k;end if;
   perform s::date;
  elsif t='url' and s !~ '^https?://[^/?#[:space:]@]+([/?#][^[:space:]]*)?$' then raise exception 'Invalid HTTP/HTTPS URL answer: %',k;
  elsif t='dropdown' and not (f->'options' ? s) then raise exception 'Invalid dropdown answer: %',k;
  elsif t='multi_select' then
   if jsonb_typeof(v)<>'array' then raise exception 'A multi-select answer must be a list: %',k;end if;
   if jsonb_array_length(v)<>(select count(distinct value) from jsonb_array_elements(v)) or exists(select 1 from jsonb_array_elements(v) a where jsonb_typeof(a)<>'string' or not (f->'options' ? (a #>> '{}'))) then raise exception 'Invalid multi-select answer: %',k;end if;
  elsif t='checkbox' and (jsonb_typeof(v)<>'boolean' or ((f->>'required')::boolean and v<>'true')) then raise exception 'Required checkbox must be checked: %',k;
  end if;
 end loop;
end $$;

create function public.manage_reporting_template(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;current_template public.form_templates%rowtype;receipt public.mutation_receipts%rowtype;
 v_request uuid:=(p_input->>'request_id')::uuid;v_template uuid:=nullif(p_input->>'template_id','')::uuid;operation text:=p_input->>'action';
 v_title text:=trim(coalesce(p_input->>'title',''));v_description text:=trim(coalesce(p_input->>'description',''));v_type text:=coalesce(p_input->>'type','custom');v_site uuid;v_sites uuid[];v_version integer;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found or actor.role<>'administrator' then raise exception 'Administrator access required' using errcode='42501';end if;
 if v_request is null or operation not in ('create','save','publish','archive') or operation is null then raise exception 'Invalid template action.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||v_request::text,0));
 select * into receipt from public.mutation_receipts where actor_id=actor.id and request_id=v_request;
 if found then
  if receipt.action<>'template.'||operation or receipt.payload_hash is distinct from md5(p_input::text) then raise exception 'This request was already saved with different values.';end if;
  return receipt.entity_id;
 end if;
 if operation<>'create' then
  select * into current_template from public.form_templates where id=v_template and workspace_id=actor.workspace_id for update;
  if not found then raise exception 'Template not found' using errcode='42501';end if;
  if (p_input->>'expected_revision')::integer is distinct from current_template.draft_revision then raise exception 'Template changed; refresh before saving.' using errcode='40001';end if;
  if current_template.state='archived' then raise exception 'Archived templates cannot be changed.';end if;
 end if;
 if operation in ('create','save') then
  if length(v_title) not between 1 and 150 or length(v_description)>2000 or v_type not in ('seo','maintenance','website_update','custom') or jsonb_typeof(p_input->'website_ids') is distinct from 'array' or jsonb_array_length(p_input->'website_ids')>100 then raise exception 'Invalid template fields.';end if;
  perform public.validate_reporting_fields(p_input->'fields',false);
  select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_sites from jsonb_array_elements_text(p_input->'website_ids');
  foreach v_site in array v_sites loop
   perform 1 from public.websites where id=v_site and workspace_id=actor.workspace_id and archived_at is null and status<>'archived' for share;
   if not found then raise exception 'Select active websites from your workspace.';end if;
  end loop;
  if operation='create' then
   insert into public.form_templates(workspace_id,title,description,type,draft_fields,draft_website_ids) values(actor.workspace_id,v_title,v_description,v_type,p_input->'fields',to_jsonb(v_sites)) returning id into v_template;
  else update public.form_templates set title=v_title,description=v_description,type=v_type,draft_fields=p_input->'fields',draft_website_ids=to_jsonb(v_sites),draft_revision=draft_revision+1 where id=v_template;end if;
 elsif operation='publish' then
  perform public.validate_reporting_fields(current_template.draft_fields,true);
  if current_template.published_draft_revision=current_template.draft_revision then raise exception 'Save changes before publishing another version.';end if;
  if jsonb_array_length(current_template.draft_website_ids)=0 then raise exception 'Assign at least one website before publishing.';end if;
  for v_site in select value::uuid from jsonb_array_elements_text(current_template.draft_website_ids) loop
   perform 1 from public.websites where id=v_site and workspace_id=actor.workspace_id and archived_at is null and status<>'archived' for share;
   if not found then raise exception 'Select active websites from your workspace.';end if;
  end loop;
  select coalesce(max(version_number),0)+1 into v_version from public.form_template_versions where template_id=v_template;
  insert into public.form_template_versions(workspace_id,template_id,version_number,title,description,type,fields) values(actor.workspace_id,v_template,v_version,current_template.title,current_template.description,current_template.type,current_template.draft_fields);
  delete from public.form_template_websites where template_id=v_template;
  insert into public.form_template_websites(workspace_id,template_id,website_id) select actor.workspace_id,v_template,value::uuid from jsonb_array_elements_text(current_template.draft_website_ids);
  update public.form_templates set state='published',draft_revision=draft_revision+1,published_draft_revision=draft_revision+1 where id=v_template;
 elsif operation='archive' then update public.form_templates set state='archived',draft_revision=draft_revision+1 where id=v_template;
 end if;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata) values(actor.workspace_id,actor.id,'template',v_template,'template.'||operation,jsonb_build_object('version',v_version));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id,payload_hash) values(actor.id,v_request,'template.'||operation,v_template,md5(p_input::text));
 return v_template;
end $$;

create function public.submit_workspace_report(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;version public.form_template_versions%rowtype;submission public.report_submissions%rowtype;receipt public.mutation_receipts%rowtype;
 v_request uuid:=(p_input->>'request_id')::uuid;v_submission uuid:=nullif(p_input->>'submission_id','')::uuid;
 v_site uuid:=(p_input->>'website_id')::uuid;v_version uuid:=(p_input->>'template_version_id')::uuid;
 v_start date:=(p_input->>'period_start')::date;v_end date:=(p_input->>'period_end')::date;v_reason text:=trim(coalesce(p_input->>'reason',''));
 v_revision uuid;revision_number integer;operation text;template_state text;latest_version uuid;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if v_request is null or v_site is null or v_version is null or v_start is null or v_end is distinct from v_start+6 or extract(isodow from v_start)<>1 or length(v_reason)>2000 then raise exception 'Invalid weekly report period or identity.';end if;
 operation:=case when v_submission is null then 'report.submit' else 'report.revise' end;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||v_request::text,0));
 select * into receipt from public.mutation_receipts where actor_id=actor.id and request_id=v_request;
 if found then
  if receipt.action<>operation or receipt.payload_hash is distinct from md5(p_input::text) then raise exception 'This request was already saved with different values.';end if;
  return receipt.entity_id;
 end if;
 select * into version from public.form_template_versions where id=v_version and workspace_id=actor.workspace_id;
 if not found then raise exception 'Template version not found' using errcode='42501';end if;
 if v_submission is null then
  select state into template_state from public.form_templates where id=version.template_id and workspace_id=actor.workspace_id for share;
  if template_state is distinct from 'published' then raise exception 'Choose a published template.';end if;
  select id into latest_version from public.form_template_versions where template_id=version.template_id order by version_number desc limit 1;
  if latest_version<>v_version then raise exception 'A newer template version is published. Reload the form.' using errcode='40001';end if;
  perform 1 from public.websites where id=v_site and workspace_id=actor.workspace_id and archived_at is null and status<>'archived' for share;
  if not found then raise exception 'Select active websites from your workspace.';end if;
  if not exists(select 1 from public.form_template_websites where template_id=version.template_id and website_id=v_site and workspace_id=actor.workspace_id) then raise exception 'This template is not assigned to this website.';end if;
  insert into public.report_submissions(workspace_id,website_id,template_id,template_version_id,submitter_id,period_start,period_end)
   values(actor.workspace_id,v_site,version.template_id,v_version,actor.id,v_start,v_end) returning * into submission;
  v_submission:=submission.id;revision_number:=1;
 else
  select * into submission from public.report_submissions where id=v_submission and workspace_id=actor.workspace_id for update;
  if not found then raise exception 'Report not found' using errcode='42501';end if;
  if actor.id<>submission.submitter_id and actor.role<>'administrator' then raise exception 'Only the original submitter or an administrator can revise this report.' using errcode='42501';end if;
  if submission.website_id<>v_site or submission.template_version_id<>v_version or submission.period_start<>v_start or submission.period_end<>v_end then raise exception 'A revision must retain the original website, period and template version.';end if;
  if length(v_reason)=0 then raise exception 'A revision reason is required.';end if;
  select coalesce(max(r.revision_number),0)+1 into revision_number from public.report_revisions r where r.submission_id=v_submission;
  if (p_input->>'expected_revision')::integer is distinct from revision_number-1 then raise exception 'Report changed; refresh before revising.' using errcode='40001';end if;
 end if;
 perform public.validate_reporting_answers(version.fields,p_input->'answers');
 insert into public.report_revisions(workspace_id,submission_id,revision_number,answers,actor_id,reason) values(actor.workspace_id,v_submission,revision_number,p_input->'answers',actor.id,nullif(v_reason,'')) returning id into v_revision;
 update public.report_submissions set current_revision_id=v_revision where id=v_submission;
 if exists(select 1 from jsonb_array_elements(version.fields) f where f->>'metric_key'='seo_score') and p_input->'answers'->'seo_score' is not null and p_input->'answers'->'seo_score'<>'null' then
  insert into public.metric_observations(workspace_id,website_id,submission_id,report_revision_id,metric_key,value,source,measured_at)
   values(actor.workspace_id,v_site,v_submission,v_revision,'seo_score',(p_input->'answers'->>'seo_score')::numeric,trim(p_input->'answers'->>'source'),(p_input->'answers'->>'measurement_date')::date);
 end if;
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata) values(actor.workspace_id,actor.id,'report',v_submission,operation,jsonb_build_object('revision',revision_number,'template_version_id',v_version,'reason',v_reason));
 insert into public.mutation_receipts(actor_id,request_id,action,entity_id,payload_hash) values(actor.id,v_request,operation,v_submission,md5(p_input::text));
 return v_submission;
end $$;
revoke all on function public.validate_reporting_fields(jsonb,boolean) from public,anon,authenticated;
revoke all on function public.validate_reporting_answers(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.manage_reporting_template(jsonb) from public,anon,authenticated;
revoke all on function public.submit_workspace_report(jsonb) from public,anon,authenticated;
grant execute on function public.manage_reporting_template(jsonb) to authenticated;
grant execute on function public.submit_workspace_report(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;


