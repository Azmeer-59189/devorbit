-- Apply after 018. Google observed load-event time remains separate from LCP and legacy Pingdom inputs.
begin;
alter table public.website_lighthouse_runs add column load_seconds numeric check(load_seconds>0 and load_seconds<=3600);
create or replace function public.finish_website_lighthouse(p_run uuid,p_result jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare run public.website_lighthouse_runs%rowtype;site public.websites%rowtype;prior uuid;day date;source_value text:='Google PageSpeed Insights / Lighthouse mobile';
begin
 select * into run from public.website_lighthouse_runs where id=p_run;
 if not found then raise exception 'Audit not found';end if;
 select * into site from public.websites where id=run.website_id for update;
 select * into run from public.website_lighthouse_runs where id=p_run for update;
 if run.state<>'running' then return run.id;end if;
 if p_result?'error_code' then
  update public.website_lighthouse_runs set state='failed',finished_at=now(),error_code='provider_failed' where id=p_run;
  return p_run;
 end if;
 if site.canonical_url<>run.requested_url or site.archived_at is not null or site.status='archived'
 or not exists(select 1 from public.profiles where id=run.actor_id and workspace_id=run.workspace_id and active) then
  update public.website_lighthouse_runs set state='failed',finished_at=now(),error_code='website_or_membership_changed' where id=p_run;
  return p_run;
 end if;
 if jsonb_typeof(p_result->'seo_score') is distinct from 'number' or jsonb_typeof(p_result->'performance_score') is distinct from 'number'
 or (p_result->>'seo_score')::numeric not between 0 and 100 or (p_result->>'performance_score')::numeric not between 0 and 100
 or nullif(p_result->>'lighthouse_version','') is null or length(p_result->>'lighthouse_version')>100
 or coalesce(p_result->>'final_url','') !~ '^https?://'
 or (p_result->>'measured_at')::timestamptz is null
 or (p_result->>'measured_at')::timestamptz<run.created_at-interval '10 minutes'
 or (p_result->>'measured_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Invalid provider audit';end if;
 update public.website_lighthouse_runs set state='completed',finished_at=now(),seo_score=(p_result->>'seo_score')::integer,
 performance_score=(p_result->>'performance_score')::integer,load_seconds=(p_result->>'load_seconds')::numeric,lcp_seconds=(p_result->>'lcp_seconds')::numeric,
 speed_index_seconds=(p_result->>'speed_index_seconds')::numeric,measured_at=(p_result->>'measured_at')::timestamptz,
 final_url=p_result->>'final_url',lighthouse_version=p_result->>'lighthouse_version' where id=p_run;
 select (now() at time zone timezone)::date into day from public.workspaces where id=run.workspace_id;
 select a.id into prior from public.website_seo_audits a where a.website_id=run.website_id and a.measurement_date=day and a.source=source_value
 and not exists(select 1 from public.website_seo_audits n where n.supersedes_id=a.id) order by a.created_at desc limit 1;
 insert into public.website_seo_audits(workspace_id,website_id,measurement_date,score,source,supersedes_id,reason,actor_id)
 values(run.workspace_id,run.website_id,day,(p_result->>'seo_score')::integer,source_value,prior,'Automatic mobile Lighthouse audit',run.actor_id);
 insert into public.audit_events(workspace_id,actor_id,entity_type,entity_id,action,safe_metadata)
 values(run.workspace_id,run.actor_id,'website',run.website_id,'seo.automated',jsonb_build_object('run_id',p_run,'strategy','mobile','seo_score',p_result->'seo_score','performance_score',p_result->'performance_score'));
 return p_run;
end $$;
create or replace function public.fixed_seo_catalog(p_site uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;sites jsonb;workspace uuid;
begin
 result:=public.fixed_seo_catalog_before_automation(p_site);
 select workspace_id into workspace from public.profiles where id=auth.uid() and active;
 if workspace is null then raise exception 'Active membership required' using errcode='42501';end if;
 select coalesce(jsonb_agg(w||jsonb_build_object('lighthouse',(
 select to_jsonb(r) from public.website_lighthouse_runs r where r.website_id=(w->>'id')::uuid and r.workspace_id=workspace
 and r.requested_url=w->>'canonical_url' and r.state='completed' order by r.created_at desc limit 1),
 'automatic_load_time',(select to_jsonb(l) from public.website_lighthouse_runs l where l.website_id=(w->>'id')::uuid and l.workspace_id=workspace
 and l.requested_url=w->>'canonical_url' and l.state='completed' and l.load_seconds is not null order by l.finished_at desc,l.id limit 1)) order by w->>'name'),'[]')
 into sites from jsonb_array_elements(result->'websites') w;
 return result||jsonb_build_object('websites',sites,'automatic_audits_enabled',true);
end $$;
revoke all on function public.finish_website_lighthouse(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_website_lighthouse(uuid,jsonb) to service_role;
revoke all on function public.fixed_seo_catalog(uuid) from public,anon,authenticated;
grant execute on function public.fixed_seo_catalog(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
