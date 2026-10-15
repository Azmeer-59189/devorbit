-- Run AFTER the foundation migration, using a database-owner session.
-- Replace only the email placeholder with your invited Auth user's email.
-- Create/invite the user through Supabase Authentication first.
-- This never creates a password or assigns a role to an arbitrary "first user".
begin;
do $$
declare
  admin_email text := 'REPLACE_WITH_YOUR_ADMIN_EMAIL';
  admin_user uuid;
  workspace uuid;
begin
  if admin_email='REPLACE_WITH_YOUR_ADMIN_EMAIL' then
    raise exception 'Replace the administrator email placeholder before running';
  end if;
  select id into admin_user from auth.users where lower(email)=lower(admin_email);
  if admin_user is null then raise exception 'Invite or create this user in Supabase Authentication first'; end if;
  if exists(select 1 from public.profiles where id=admin_user) then
    raise exception 'This user already has a profile; bootstrap will not change existing membership';
  end if;
  if exists(select 1 from public.workspaces) then
    raise exception 'A workspace already exists; add members through a reviewed provisioning process';
  end if;
  insert into public.workspaces(name,timezone) values('International Desk','Asia/Karachi') returning id into workspace;
  insert into public.profiles(id,workspace_id,display_name,role,active)
    values(admin_user,workspace,'Workspace Administrator','administrator',true);
end $$;
commit;
