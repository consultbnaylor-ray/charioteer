-- Garmin catch-up refusal and the last push clock. Not applied from this repo. Ben reviews this file before it runs.
-- history_backfill_refused_at is when every backfill came back 412. The refresh skips those calls for a day.
-- last_push_at is when a summary push was stored. The status view exposes both clocks. No token is selected.

alter table public.garmin_connections
  add column if not exists history_backfill_refused_at timestamptz,
  add column if not exists last_push_at timestamptz;

comment on column public.garmin_connections.history_backfill_refused_at is
  'When Garmin refused historical catch-up for every summary. Not a token.';

comment on column public.garmin_connections.last_push_at is
  'When a Garmin summary push was last stored for this person. Not a token.';

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
  )), '') as missing_permissions,
  last_push_at,
  history_backfill_refused_at
from public.garmin_connections
where user_id = auth.uid();

comment on view public.garmin_connection_status is
  'Owner connection flag, export gaps, the last push clock, and the catch-up refusal clock. No token is selected.';
