-- Let a signed-in person read their own consent rows, and ignore a repeat insert.
--
-- 20261010130000_tighten_grants.sql left consents as INSERT only. That matched
-- the app until a crash saved onboarding_complete without any consent rows.
-- The app now reads kind and version to decide whether to show the consent
-- screen again. consents_own already limits rows to auth.uid().
--
-- A unique (user_id, kind, version) makes the second insert a no-op. Duplicate
-- rows, if any, are reduced to the newest before the index is created.

delete from public.consents as older
where exists (
  select 1
  from public.consents as newer
  where newer.user_id = older.user_id
    and newer.kind = older.kind
    and newer.version = older.version
    and (
      newer.created_at > older.created_at
      or (newer.created_at = older.created_at and newer.id > older.id)
    )
);

create unique index if not exists consents_user_kind_version_key
  on public.consents (user_id, kind, version);

grant select on public.consents to authenticated;
