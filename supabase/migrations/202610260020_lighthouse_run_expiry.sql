-- Apply after 019. Runs the server stopped before finishing expire instead of staying running; the catalog returns only displayed columns.
begin;
create or replace function public.start_website_lighthouse(p_site uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;site public.websites%rowtype;run public.website_lighthouse_runs%rowtype;
begin
 select * into actor from public.profiles where id=auth.uid() and active for share;
 if not found then raise exception 'Active membership required' using errcode='42501';end if;
 if p_request is null then raise exception 'Invalid audit request';end if;
 -- Serialize workspace quota checks as well as website runs.
 perform pg_advisory_xact_lock(hashtextextended('lighthouse:'||actor.workspace_id::text,0));
 select * into site from public.websites where id=p_site and workspace_id=actor.workspace_id for update;
 if not found then raise exception 'Website not found' using errcode='42501';end if;
 select * into run from public.website_lighthouse_runs where actor_id=actor.id and request_id=p_request;
 if found then
  if run.website_id<>p_site then raise exception 'Request already used for another website';end if;
  return to_jsonb(run)||jsonb_build_object('started',false);
 end if;
 -- The audit route stops after 240 seconds, so an older running attempt can never finish.
 update public.website_lighthouse_runs set state='failed',finished_at=now(),error_code='timed_out'
 where workspace_id=actor.workspace_id and state='running' and created_at<now()-interval '5 minutes';
 if site.archived_at is not null or site.status='archived' then raise exception 'Restore this website before auditing';end if;
 if exists(select 1 from public.website_lighthouse_runs where website_id=p_site and created_at>now()-interval '5 minutes') then
  raise exception 'Wait at least five minutes between automatic audits for this website.' using errcode='54000';end if;
 if (select count(*) from public.website_lighthouse_runs where workspace_id=actor.workspace_id and created_at>now()-interval '1 hour')>=20 then
  raise exception 'Too many automatic audits. The workspace limit is 20 per hour.' using errcode='54000';end if;
 insert into public.website_lighthouse_runs(workspace_id,website_id,actor_id,request_id,requested_url)
 values(actor.workspace_id,p_site,actor.id,p_request,site.canonical_url) returning * into run;
 return to_jsonb(run)||jsonb_build_object('started',true);
end $$;
create or replace function public.fixed_seo_catalog(p_site uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;sites jsonb;workspace uuid;
begin
 result:=public.fixed_seo_catalog_before_automation(p_site);
 select workspace_id into workspace from public.profiles where id=auth.uid() and active;
 if workspace is null then raise exception 'Active membership required' using errcode='42501';end if;
 select coalesce(jsonb_agg(w||jsonb_build_object('lighthouse',(
 select to_jsonb(r) from (select id,seo_score,performance_score,lcp_seconds,speed_index_seconds,measured_at,finished_at,lighthouse_version
 from public.website_lighthouse_runs where website_id=(w->>'id')::uuid and workspace_id=workspace
 and requested_url=w->>'canonical_url' and state='completed' order by finished_at desc,id limit 1) r),
 'automatic_load_time',(select to_jsonb(l) from (select id,load_seconds,measured_at,finished_at,lighthouse_version
 from public.website_lighthouse_runs where website_id=(w->>'id')::uuid and workspace_id=workspace
 and requested_url=w->>'canonical_url' and state='completed' and load_seconds is not null order by finished_at desc,id limit 1) l)) order by w->>'name'),'[]')
 into sites from jsonb_array_elements(result->'websites') w;
 return result||jsonb_build_object('websites',sites,'automatic_audits_enabled',true);
end $$;
revoke all on function public.start_website_lighthouse(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_website_lighthouse(uuid,uuid) to authenticated;
revoke all on function public.fixed_seo_catalog(uuid) from public,anon,authenticated;
grant execute on function public.fixed_seo_catalog(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
