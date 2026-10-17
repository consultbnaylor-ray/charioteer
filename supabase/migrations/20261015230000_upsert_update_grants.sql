-- Client upserts name every sent column in DO UPDATE SET, including the conflict key.
-- Saving a quote upserts on (user_id, quote_id) and sends only those two columns.
-- authenticated could select, insert, and delete user_quotes, and there was no
-- UPDATE policy, so a second save of the same quote failed.
--
-- created_at is not sent, so it stays without UPDATE. The same rule already
-- holds for health_samples.id and health_samples.created_at
-- (20261010140000_health_upsert_grant.sql).
--
-- The other client upserts already cover every column they send:
-- health_samples: value, unit, plus user_id, kind, recorded_on, source
-- device_tokens: expo_push_token, platform, updated_at, plus user_id
--   (20261015050000_profile_viewer_push_fixes.sql)
-- nutrition_settings, nutrition_days, body_composition, profile_sharing:
--   table-level UPDATE
-- health_plans.user_id: 20261015220000_health_plans_upsert_grant.sql
--
-- Additive. The row policy still requires user_id = auth.uid().

grant update (user_id, quote_id) on public.user_quotes to authenticated;

create policy user_quotes_update on public.user_quotes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
declare
  n int;
begin
  select count(distinct column_name) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'user_quotes'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
    and column_name in ('user_id', 'quote_id');
  if n <> 2 then
    raise exception 'user_quotes upsert columns are missing an UPDATE grant (expected user_id, quote_id)';
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'user_quotes'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE'
    and column_name = 'created_at';
  if n <> 0 then
    raise exception 'user_quotes still allows updates of created_at';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'user_quotes'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE';
  if n <> 0 then
    raise exception 'user_quotes still has table-level UPDATE';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_quotes'
      and policyname = 'user_quotes_update'
      and cmd = 'UPDATE'
      and coalesce(qual, '') ilike '%user_id%'
      and coalesce(qual, '') ilike '%auth.uid()%'
      and coalesce(with_check, '') ilike '%user_id%'
      and coalesce(with_check, '') ilike '%auth.uid()%'
      and 'authenticated' = any (roles)
  ) then
    raise exception 'user_quotes_update no longer forces user_id = auth.uid()';
  end if;
end $$;
