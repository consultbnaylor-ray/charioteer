-- Build 23. Additive. Not applied from this repo.
-- A client request id so a retry does not write the same turn twice.
-- Daily counts of coach fallbacks, for an alert. The phone cannot read them.

alter table public.thumos_messages
  add column if not exists request_id uuid;

alter table public.thumos_messages
  drop constraint if exists thumos_messages_request_role_key;

alter table public.thumos_messages
  add constraint thumos_messages_request_role_key
  unique (user_id, request_id, role);

create table if not exists public.thumos_fallback_days (
  day date primary key,
  offline_count integer not null default 0 check (offline_count >= 0),
  scripted_count integer not null default 0 check (scripted_count >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table public.thumos_fallback_days from public, anon, authenticated;

alter table public.thumos_fallback_days enable row level security;

comment on table public.thumos_fallback_days is
  'Service role only. Counts of Thumos replies that were not the model, so an alert can watch them.';
