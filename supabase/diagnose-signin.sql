-- Read-only diagnosis. Run as database owner in Supabase SQL Editor.
-- Replace the email placeholder. No passwords, hashes or tokens are returned.
with expected as (select 'REPLACE_WITH_YOUR_ADMIN_EMAIL'::text as email)
select
  u.id is not null as auth_user_exists,
  u.email_confirmed_at is not null as email_confirmed,
  coalesce(length(u.encrypted_password)>0,false) as password_is_set,
  coalesce(u.banned_until>now(),false) as account_is_banned,
  p.id is not null as workspace_profile_exists,
  coalesce(p.active,false) as profile_is_active,
  w.id is not null as workspace_exists
from expected e
left join auth.users u on lower(u.email)=lower(e.email)
left join public.profiles p on p.id=u.id
left join public.workspaces w on w.id=p.workspace_id;
