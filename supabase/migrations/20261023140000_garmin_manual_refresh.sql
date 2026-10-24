-- Manual Garmin refresh clock. Not applied from this repo. Ben reviews this file before it runs.
-- One timestamp on the existing connection row. It is not a health reading.
-- Authenticated still has no privilege on garmin_connections. Service role already has all.

alter table public.garmin_connections
  add column last_manual_refresh_at timestamptz;

comment on column public.garmin_connections.last_manual_refresh_at is
  'When this account last asked Garmin to resend recent summaries. Service role only. No health value is stored.';
