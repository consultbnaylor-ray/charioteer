-- Tighten table privileges for hosted Supabase.
--
-- The init migration (supabase/migrations/20261010120000_init.sql) is already
-- applied on the live project. Its statements are left unchanged so migration
-- history is not rewritten. This file enforces what that migration intended.
--
-- Intent of the init grants, worked out again from the client and edge function:
--   profiles: SELECT, and UPDATE only of the columns the app writes.
--     Never is_moderator, id, created_at, or updated_at.
--     The app does not INSERT profiles (handle_new_user does, as security definer).
--   connections: SELECT, INSERT, and UPDATE of status only.
--   reports: SELECT, INSERT, and UPDATE of status only.
--   health_samples: SELECT, INSERT, and UPDATE of value and unit (upsert).
--   reasons: SELECT, INSERT, DELETE (the app replaces rows; it does not UPDATE).
--   Other tables: only the statements the app actually issues.
--   resources: SELECT for authenticated, and SELECT for anon so a signed-out
--     person can read helplines. RLS limits anon to category = 'helplines'.
--
-- Why the init grants did not hold on the hosted project:
-- Supabase grants ALL on new public tables to anon and authenticated through
-- default privileges. Init revoked those privileges from anon only, then added
-- column-level UPDATE grants. Column grants are additive. authenticated still
-- had table-level UPDATE, so a user could set is_moderator = true (HTTP 200).
-- REVOKE ALL removes the table-level privilege. The column grants below are
-- then the only UPDATE authenticated has.

revoke all privileges on all tables in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from public, anon, authenticated';
  end if;
exception
  when insufficient_privilege then null;
end $$;

grant select on public.profiles to authenticated;
grant update (
  display_name,
  sobriety_started_at,
  weekly_spend_gbp,
  weekly_units,
  town,
  age_confirmed_18,
  community_visible,
  consent_health,
  consent_ai,
  onboarding_complete,
  text_scale,
  theme_preference
) on public.profiles to authenticated;

grant select on public.directory to authenticated;

grant insert on public.consents to authenticated;

grant select, insert, delete on public.reasons to authenticated;

grant select, insert on public.check_ins to authenticated;

grant select, insert on public.relapses to authenticated;

grant select, insert on public.health_samples to authenticated;
grant update (value, unit) on public.health_samples to authenticated;

grant select, insert on public.thumos_messages to authenticated;

grant select, insert on public.interests to authenticated;

grant select, insert, delete on public.profile_interests to authenticated;

grant select, insert on public.connections to authenticated;
grant update (status) on public.connections to authenticated;

grant select, insert on public.direct_messages to authenticated;

grant insert, delete on public.blocks to authenticated;

grant select, insert on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

grant select on public.resources to authenticated;
grant select on public.resources to anon;

drop policy if exists resources_read_anon on public.resources;
create policy resources_read_anon on public.resources
  for select to anon
  using (category = 'helplines');

-- Fails the migration if a client role can still write a protected column
-- or if anon lost the helpline read.
do $$
declare
  n int;
begin
  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if n <> 0 then
    raise exception 'profiles still has broad table privileges for a client role';
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE'
    and column_name in ('is_moderator', 'id', 'created_at', 'updated_at');
  if n <> 0 then
    raise exception 'a protected profile column is still updatable';
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
    and column_name = 'display_name';
  if n < 1 then
    raise exception 'display_name update grant is missing';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and grantee = 'authenticated'
    and privilege_type = 'SELECT'
    and table_name = 'profiles';
  if n < 1 then
    raise exception 'profiles select grant is missing';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in ('connections', 'reports', 'health_samples')
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE';
  if n <> 0 then
    raise exception 'connections, reports, or health_samples still have table-level UPDATE';
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name in ('connections', 'reports')
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE'
    and column_name <> 'status';
  if n <> 0 then
    raise exception 'connections or reports allow updates beyond status';
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'connections'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
    and column_name = 'status';
  if n < 1 then
    raise exception 'connections status update grant is missing';
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'reports'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
    and column_name = 'status';
  if n < 1 then
    raise exception 'reports status update grant is missing';
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'health_samples'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE'
    and column_name not in ('value', 'unit');
  if n <> 0 then
    raise exception 'health_samples allows updates beyond value and unit';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and grantee = 'anon'
    and not (table_name = 'resources' and privilege_type = 'SELECT');
  if n <> 0 then
    raise exception 'anon has a privilege other than select on resources';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'resources'
    and grantee = 'anon'
    and privilege_type = 'SELECT';
  if n < 1 then
    raise exception 'anon cannot select resources';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type = 'TRUNCATE';
  if n <> 0 then
    raise exception 'a client role still has TRUNCATE';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'resources'
      and policyname = 'resources_read_anon'
      and 'anon' = any (roles)
  ) then
    raise exception 'anon helpline read policy is missing';
  end if;
end $$;
