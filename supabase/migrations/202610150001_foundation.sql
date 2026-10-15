-- Phase 0 foundation. No business mutation policies are enabled yet.
-- Apply to a new Supabase project with its migration runner, not from the browser.
begin;
create extension if not exists pgcrypto;
create type public.workspace_role as enum ('administrator','manager','developer');
create type public.task_progress as enum ('to_do','in_progress','blocked','in_review','completed','cancelled');
create type public.assignment_state as enum ('pending','accepted','declined','withdrawn','superseded');
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id),
  workspace_id uuid not null references public.workspaces(id),
  display_name text not null,
  role public.workspace_role not null default 'developer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id,id)
);
create function public.is_workspace_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id=auth.uid() and workspace_id=target and active);
$$;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
create table public.websites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  name text not null, country text not null, canonical_url text not null,
  cms text, status text not null default 'active',
  configuration jsonb not null default '{}', archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,canonical_url)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  creator_id uuid not null, assignee_id uuid,
  title text not null check(length(trim(title))>0), description text,
  category text not null default 'general',
  priority text not null check(priority in ('low','medium','high','urgent')) default 'medium',
  progress public.task_progress not null default 'to_do',
  due_date date, review_required boolean not null default false, reviewer_id uuid,
  blocker_reason text, completed_at timestamptz, archived_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  unique (workspace_id,id),
  foreign key(workspace_id,creator_id) references public.profiles(workspace_id,id),
  foreign key(workspace_id,assignee_id) references public.profiles(workspace_id,id),
  foreign key(workspace_id,reviewer_id) references public.profiles(workspace_id,id),
  check(not review_required or reviewer_id is not null),
  check(not review_required or assignee_id is null or reviewer_id<>assignee_id),
  check(progress<>'blocked' or coalesce(length(trim(blocker_reason)),0)>0),
  check(progress<>'completed' or completed_at is not null)
);
create table public.assignment_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  task_id uuid not null, recipient_id uuid not null, requester_id uuid not null,
  state public.assignment_state not null default 'pending', reason text,
  created_at timestamptz not null default now(), responded_at timestamptz,
  foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
  foreign key(workspace_id,recipient_id) references public.profiles(workspace_id,id),
  foreign key(workspace_id,requester_id) references public.profiles(workspace_id,id),
  check(state<>'declined' or coalesce(length(trim(reason)),0)>0)
);
create unique index one_pending_assignment on public.assignment_requests(task_id) where state='pending';
create table public.task_websites (
  workspace_id uuid not null, task_id uuid not null, website_id uuid not null,
  primary key(task_id,website_id),
  foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
  foreign key(workspace_id,website_id) references public.websites(workspace_id,id)
);
create table public.work_logs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  user_id uuid not null, task_id uuid, work_date date not null,
  duration_minutes integer not null check(duration_minutes>0 and duration_minutes<=1440),
  category text not null, notes text not null,
  created_at timestamptz not null default now(), revision integer not null default 1,
  unique(workspace_id,id),
  foreign key(workspace_id,user_id) references public.profiles(workspace_id,id),
  foreign key(workspace_id,task_id) references public.tasks(workspace_id,id)
);
create table public.work_log_websites (
  workspace_id uuid not null, work_log_id uuid not null, website_id uuid not null,
  primary key(work_log_id,website_id),
  foreign key(workspace_id,work_log_id) references public.work_logs(workspace_id,id),
  foreign key(workspace_id,website_id) references public.websites(workspace_id,id)
);
create table public.form_templates (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  title text not null, state text not null check(state in ('draft','published','archived')) default 'draft',
  draft_fields jsonb not null default '[]', unique(workspace_id,id)
);
create table public.form_template_versions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  template_id uuid not null, version_number integer not null check(version_number>0),
  fields jsonb not null, published_at timestamptz not null default now(),
  unique(template_id,version_number), unique(workspace_id,id),
  foreign key(workspace_id,template_id) references public.form_templates(workspace_id,id)
);
create table public.report_submissions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  website_id uuid not null, template_id uuid not null, template_version_id uuid not null,
  submitter_id uuid not null, period_start date not null, period_end date not null,
  unique(website_id,template_id,period_start,period_end), unique(workspace_id,id),
  foreign key(workspace_id,website_id) references public.websites(workspace_id,id),
  foreign key(workspace_id,template_id) references public.form_templates(workspace_id,id),
  foreign key(workspace_id,template_version_id) references public.form_template_versions(workspace_id,id),
  foreign key(workspace_id,submitter_id) references public.profiles(workspace_id,id),
  check(period_end>=period_start)
);
create table public.report_revisions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  submission_id uuid not null, revision_number integer not null check(revision_number>0),
  answers jsonb not null, actor_id uuid not null, reason text,
  created_at timestamptz not null default now(),
  unique(submission_id,revision_number),
  foreign key(workspace_id,submission_id) references public.report_submissions(workspace_id,id),
  foreign key(workspace_id,actor_id) references public.profiles(workspace_id,id),
  check(revision_number=1 or coalesce(length(trim(reason)),0)>0)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  actor_id uuid not null, entity_type text not null, entity_id uuid not null,
  action text not null, safe_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(workspace_id,actor_id) references public.profiles(workspace_id,id)
);
create function public.reject_immutable_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Immutable record; append a new version or revision instead'; end;
$$;
create trigger immutable_template_versions before update or delete on public.form_template_versions for each row execute function public.reject_immutable_mutation();
create trigger immutable_report_revisions before update or delete on public.report_revisions for each row execute function public.reject_immutable_mutation();
create trigger immutable_audit_events before update or delete on public.audit_events for each row execute function public.reject_immutable_mutation();
alter table public.workspaces enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(public.is_workspace_member(id));
do $$ declare table_name text; begin
  foreach table_name in array array['profiles','websites','tasks','assignment_requests','task_websites','work_logs','work_log_websites','form_templates','form_template_versions','report_submissions','report_revisions','audit_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy member_read on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', table_name);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', table_name);
  end loop;
end $$;
revoke insert, update, delete on public.workspaces from anon,authenticated;
create index tasks_workspace_progress on public.tasks(workspace_id,progress);
create index work_logs_workspace_date on public.work_logs(workspace_id,work_date);
-- Invitations, mutation RPCs, notifications, collaborators, reviews, metrics,
-- attachments and schedule tables are deferred to their tested vertical slices.
commit;

