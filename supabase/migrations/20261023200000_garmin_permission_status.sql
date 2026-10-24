-- Garmin permission status. Not applied from this repo. Ben reviews this file before it runs.
-- The status view tells the owner whether Activities or Daily Health exports are missing.
-- It does not expose tokens, ciphertext, or the raw permissions text.
-- Null permissions still mean the lookup failed. An empty string means Garmin returned none.
-- Apply after garmin_user_metrics exists. The permissions-null migration can run before or after this one.

alter table public.garmin_connections
  add column if not exists permissions_checked_at timestamptz;

comment on column public.garmin_connections.permissions_checked_at is
  'When the server last read this person''s Garmin export permissions. Not a token.';

create or replace view public.garmin_connection_status
with (security_invoker = false, security_barrier = true) as
select
  user_id,
  connected_at,
  revoked_at,
  (revoked_at is null and access_token_ciphertext <> '') as connected,
  (
    revoked_at is null
    and access_token_ciphertext <> ''
    and (
      permissions is null
      or permissions !~ '(^| )ACTIVITY_EXPORT($| )'
      or permissions !~ '(^| )HEALTH_EXPORT($| )'
      or (
        connected_at < now() - interval '24 hours'
        and not exists (select 1 from public.garmin_dailies d where d.user_id = garmin_connections.user_id)
        and not exists (select 1 from public.garmin_activities a where a.user_id = garmin_connections.user_id)
        and not exists (select 1 from public.garmin_sleep s where s.user_id = garmin_connections.user_id)
        and not exists (select 1 from public.garmin_user_metrics m where m.user_id = garmin_connections.user_id)
      )
    )
  ) as needs_permissions,
  coalesce(trim(both from concat_ws(' ',
    case
      when revoked_at is null and access_token_ciphertext <> ''
        and (permissions is null or permissions !~ '(^| )ACTIVITY_EXPORT($| )')
      then 'ACTIVITY_EXPORT'
    end,
    case
      when revoked_at is null and access_token_ciphertext <> ''
        and (permissions is null or permissions !~ '(^| )HEALTH_EXPORT($| )')
      then 'HEALTH_EXPORT'
    end
  )), '') as missing_permissions
from public.garmin_connections
where user_id = auth.uid();

comment on view public.garmin_connection_status is
  'Owner connection flag. needs_permissions and missing_permissions name the exports only. No token is selected.';
