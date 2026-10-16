-- Apply after 001–011. Generated maintenance dates are reference dates, not completion evidence.
begin;
create function public.enrich_fixed_seo(p_fields jsonb,p_notes jsonb,p_today date,p_source text default '') returns jsonb
language plpgsql immutable set search_path='' as $$
declare fields_value jsonb:=coalesce(p_fields,'{}');notes_value jsonb:=coalesce(p_notes,'{}');
 month_date date:=(p_today-interval '1 month')::date;week_date date:=p_today-7;
 f jsonb;v text;summary text:='';section text:='';line text;actions text:='';raw_value text;total integer:=0;missing integer:=0;
begin
 fields_value:=fields_value||jsonb_build_object('qa','Automatic QA reference date: '||month_date::text,'plugin_updated',month_date,'backup_date',week_date);
 notes_value:=notes_value||jsonb_build_object('qa','Automatically filled one calendar month before today; not a confirmed QA completion date.',
 'plugin_updated','Automatically filled one calendar month before today; not a confirmed plugin-update completion date.',
 'backup_date','Automatically filled seven days before today; not evidence of a successful backup or restore.');
 for f in select value from jsonb_array_elements(public.fixed_seo_fields()) loop
  if f->>'key'='remarks' then continue;end if;
  total:=total+1;v:=fields_value->>(f->>'key');raw_value:=v;
  if f->>'type'='status' and coalesce(raw_value,'unknown') in ('no','not_yet','in_progress','unknown') then actions:=actions||case raw_value when 'no' then 'Review missing ' when 'not_yet' then 'Set up ' when 'in_progress' then 'Finish work on ' else 'Verify ' end||(f->>'label')||'; ';end if;
  if (f->>'key') in ('donation_crm','donation_checkout','event_platform') and lower(trim(coalesce(v,''))) in ('no','not yet') then actions:=actions||'Review setup for '||(f->>'label')||'; ';end if;
  if v is null or v='' or v='unknown' then v:='Not recorded';missing:=missing+1;
  elsif f->>'type'='status' then v:=case v when 'yes' then 'Yes' when 'no' then 'No' when 'in_progress' then 'Work in progress' when 'not_yet' then 'Not yet' when 'not_applicable' then 'Not applicable' else v end;
  end if;
  if f->>'key'='seo_score' and v<>'Not recorded' then v:=v||'/100';end if;
  if f->>'key'='page_seconds' and v<>'Not recorded' then v:=v||' seconds (measurement method/date unspecified unless separately documented)';end if;
  if section is distinct from f->>'group' then section:=f->>'group';summary:=summary||case when summary='' then '' else E'\n\n' end||section||': ';else summary:=summary||'; ';end if;
  line:=(f->>'label')||': '||left(v,150);
  if length(coalesce(notes_value->>(f->>'key'),''))>0 and (f->>'key') not in ('qa','plugin_updated','backup_date') then line:=line||' ('||left(notes_value->>(f->>'key'),120)||')';end if;
  summary:=summary||line;
 end loop;
 summary:='Audit source: '||coalesce(nullif(p_source,''),'Not recorded')||E'\nAutomatic summary of the current form. '||missing::text||' of '||total::text||' fields are unspecified.'||E'\n\n'||summary||E'\n\nMaintenance dates above are automatic reference dates, not verified completion records. No live website audit or backup check was performed by this summary.';
 summary:=left(summary,3600)||E'\n\nRecommended next actions: '||case when actions='' then 'No missing checklist setup was identified from recorded statuses. Continue verifying recorded settings.' else left(actions,900) end||E'\nMaintenance dates are automatic references, not verified completion records. This is a form-based summary, not a live audit.';
 fields_value:=fields_value||jsonb_build_object('remarks',left(summary,5000));
 return jsonb_build_object('fields',fields_value,'notes',notes_value);
end $$;

alter function public.save_fixed_seo(jsonb) rename to save_fixed_seo_record;
revoke all on function public.save_fixed_seo_record(jsonb) from public,anon,authenticated;
create function public.save_fixed_seo(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare today date;generated jsonb;
begin
 select (now() at time zone w.timezone)::date into today from public.profiles p join public.workspaces w on w.id=p.workspace_id where p.id=auth.uid() and p.active;
 if today is null then raise exception 'Active membership required' using errcode='42501';end if;
 select coalesce((select r.created_at at time zone w.timezone from public.mutation_receipts r where r.actor_id=auth.uid() and r.request_id=(p_input->>'request_id')::uuid),now() at time zone w.timezone)::date into today
 from public.profiles p join public.workspaces w on w.id=p.workspace_id where p.id=auth.uid() and p.active;
 generated:=public.enrich_fixed_seo(p_input->'fields',p_input->'notes',today,p_input->>'source');
 return public.save_fixed_seo_record(p_input||generated);
end $$;

alter function public.fixed_seo_catalog(uuid) rename to fixed_seo_catalog_record;
revoke all on function public.fixed_seo_catalog_record(uuid) from public,anon,authenticated;
create function public.fixed_seo_catalog(p_site uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;today date;sites jsonb;
begin
 -- The original reader still scopes every row to verified membership and workspace.
 result:=public.fixed_seo_catalog_record(p_site);
 select (now() at time zone w.timezone)::date into today from public.profiles p join public.workspaces w on w.id=p.workspace_id where p.id=auth.uid() and p.active;
 select coalesce(jsonb_agg(w||public.enrich_fixed_seo((w->'fields')||jsonb_build_object('website_url',w->>'canonical_url','cms',coalesce(w->>'cms','')),w->'notes',today,w->>'source') order by w->>'name'),'[]') into sites from jsonb_array_elements(result->'websites') w;
 return result||jsonb_build_object('websites',sites,'automatic_reference_date',today);
end $$;
revoke all on function public.enrich_fixed_seo(jsonb,jsonb,date,text),public.save_fixed_seo(jsonb),public.fixed_seo_catalog(uuid) from public,anon,authenticated;
grant execute on function public.save_fixed_seo(jsonb),public.fixed_seo_catalog(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
