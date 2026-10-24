-- Health upsert needs UPDATE on the conflict columns.
--
-- saveHealth upserts on (user_id, kind, recorded_on, source) and sends
-- user_id, kind, value, unit, recorded_on, and source. PostgREST puts every
-- sent column in the UPDATE, including the conflict keys. The already-applied
-- 20261010130000_tighten_grants.sql granted UPDATE only on value and unit, so
-- the upsert fails with 42501 permission denied for table health_samples.
-- Do not edit that file. Column grants are additive, so this migration adds
-- the four missing columns.
--
-- health_own (20261010120000_init.sql) is FOR ALL with
-- USING (user_id = auth.uid()) and WITH CHECK (user_id = auth.uid()).
-- UPDATE on user_id cannot move a row to another account: the new value
-- still has to be the signed-in user.
--
-- Apply this after tighten_grants. That migration also revoked default
-- privileges in schema public, so a future table gets nothing until it has
-- its own explicit grants.

grant update (user_id, kind, recorded_on, source) on public.health_samples to authenticated;

do $$
declare
  n int;
begin
  select count(distinct column_name) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'health_samples'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
    and column_name in ('user_id', 'kind', 'recorded_on', 'source', 'value', 'unit');
  if n <> 6 then
    raise exception 'health_samples upsert columns are missing an UPDATE grant (expected user_id, kind, recorded_on, source, value, unit)';
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'health_samples'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE'
    and column_name in ('id', 'created_at');
  if n <> 0 then
    raise exception 'health_samples still allows updates of id or created_at';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'health_samples'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE';
  if n <> 0 then
    raise exception 'health_samples still has table-level UPDATE';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'health_samples'
      and policyname = 'health_own'
      and cmd = 'ALL'
      and coalesce(qual, '') ilike '%user_id%'
      and coalesce(qual, '') ilike '%auth.uid()%'
      and coalesce(with_check, '') ilike '%user_id%'
      and coalesce(with_check, '') ilike '%auth.uid()%'
      and 'authenticated' = any (roles)
  ) then
    raise exception 'health_own no longer forces user_id = auth.uid()';
  end if;
end $$;
