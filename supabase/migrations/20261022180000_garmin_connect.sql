-- Garmin Connect. Not applied from this repo. Ben reviews this file before it runs.
-- Push summaries only. No historical backfill. No path or position columns.
-- Tokens are AES-GCM ciphertext plus a nonce. Authenticated cannot read that table.
-- The edge functions hold GARMIN_TOKEN_KEY. This file does not create a Vault secret.

create table public.garmin_oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_verifier text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.garmin_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  garmin_user_id text,
  access_token_ciphertext text not null default '',
  access_token_nonce text not null default '',
  refresh_token_ciphertext text not null default '',
  refresh_token_nonce text not null default '',
  token_key_version smallint not null default 1,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  scopes text not null default '',
  permissions text not null default '',
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (garmin_user_id is null or garmin_user_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  check (token_key_version >= 1)
);

create unique index garmin_connections_garmin_user_id
  on public.garmin_connections (garmin_user_id)
  where garmin_user_id is not null;

create table public.garmin_dailies (
  user_id uuid not null references public.profiles (id) on delete cascade,
  calendar_date date not null,
  resting_heart_rate_bpm integer,
  average_heart_rate_bpm integer,
  moderate_minutes integer,
  vigorous_minutes integer,
  primary key (user_id, calendar_date),
  check (resting_heart_rate_bpm is null or resting_heart_rate_bpm between 20 and 250),
  check (average_heart_rate_bpm is null or average_heart_rate_bpm between 20 and 250),
  check (moderate_minutes is null or moderate_minutes between 0 and 1440),
  check (vigorous_minutes is null or vigorous_minutes between 0 and 1440)
);

create table public.garmin_activities (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  activity_type text not null default '',
  activity_name text not null default '',
  started_at timestamptz not null,
  duration_seconds integer not null,
  average_heart_rate_bpm integer,
  training_effect numeric(3, 1),
  anaerobic_effect numeric(3, 1),
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  check (char_length(activity_type) <= 40),
  check (char_length(activity_name) <= 80),
  check (duration_seconds between 0 and 86400),
  check (average_heart_rate_bpm is null or average_heart_rate_bpm between 20 and 250),
  check (training_effect is null or training_effect between 0 and 5),
  check (anaerobic_effect is null or anaerobic_effect between 0 and 5)
);

create table public.garmin_sleep (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  duration_seconds integer not null,
  deep_seconds integer,
  light_seconds integer,
  rem_seconds integer,
  awake_seconds integer,
  sleep_score integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  check (duration_seconds between 0 and 86400),
  check (deep_seconds is null or deep_seconds between 0 and 86400),
  check (light_seconds is null or light_seconds between 0 and 86400),
  check (rem_seconds is null or rem_seconds between 0 and 86400),
  check (awake_seconds is null or awake_seconds between 0 and 86400),
  check (sleep_score is null or sleep_score between 0 and 100)
);

alter table public.garmin_oauth_states enable row level security;
alter table public.garmin_connections enable row level security;
alter table public.garmin_dailies enable row level security;
alter table public.garmin_activities enable row level security;
alter table public.garmin_sleep enable row level security;

create policy garmin_dailies_own on public.garmin_dailies
  for select to authenticated
  using (user_id = auth.uid());

create policy garmin_activities_own on public.garmin_activities
  for select to authenticated
  using (user_id = auth.uid());

create policy garmin_sleep_own on public.garmin_sleep
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.garmin_oauth_states from public, anon, authenticated;
revoke all on table public.garmin_connections from public, anon, authenticated;
revoke all on table public.garmin_dailies from public, anon, authenticated;
revoke all on table public.garmin_activities from public, anon, authenticated;
revoke all on table public.garmin_sleep from public, anon, authenticated;

grant all on table public.garmin_oauth_states to service_role;
grant all on table public.garmin_connections to service_role;
grant all on table public.garmin_dailies to service_role;
grant all on table public.garmin_activities to service_role;
grant all on table public.garmin_sleep to service_role;

grant select on table public.garmin_dailies to authenticated;
grant select on table public.garmin_activities to authenticated;
grant select on table public.garmin_sleep to authenticated;

create view public.garmin_connection_status
with (security_invoker = false, security_barrier = true) as
select
  user_id,
  connected_at,
  revoked_at,
  (revoked_at is null and access_token_ciphertext <> '') as connected
from public.garmin_connections
where user_id = auth.uid();

revoke all on table public.garmin_connection_status from public, anon;
grant select on table public.garmin_connection_status to authenticated;

comment on table public.garmin_connections is
  'Owner tokens as AES-GCM ciphertext. Service role only. The status view exposes connected, connected_at, and revoked_at.';

comment on table public.garmin_oauth_states is
  'Short-lived PKCE verifier. Service role only. Deleted when the code is exchanged or when it expires.';

comment on table public.garmin_dailies is
  'Own daily heart rate and effort minutes. Owner can read. No path is stored.';

comment on table public.garmin_activities is
  'Own workouts, heart rate, and training effect. Owner can read. No path is stored.';

comment on table public.garmin_sleep is
  'Own sleep summaries. Owner can read. No path is stored.';

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'reasons', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order), '[]'::jsonb) from public.reasons r where r.user_id = uid),
    'check_ins', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.check_ins c where c.user_id = uid),
    'relapses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.relapses r where r.user_id = uid),
    'health_samples', (select coalesce(jsonb_agg(to_jsonb(h) order by h.recorded_on), '[]'::jsonb) from public.health_samples h where h.user_id = uid),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.consents c where c.user_id = uid),
    'thumos_messages', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) from public.thumos_messages m where m.user_id = uid),
    'interests', (
      select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.user_id = uid
    ),
    'connections', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.connections c
      where uid in (c.requester_id, c.addressee_id)
    ),
    'messages', (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
      from public.direct_messages m
      join public.connections c on c.id = m.connection_id
      where uid in (c.requester_id, c.addressee_id)
    ),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.reports r where r.reporter_id = uid),
    'progress_photos', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.month_index, p.taken_on), '[]'::jsonb)
      from public.progress_photos p
      where p.user_id = uid
    ),
    'gratitude_entries', (
      select coalesce(jsonb_agg(to_jsonb(g) order by g.entry_date, g.created_at), '[]'::jsonb)
      from public.gratitude_entries g
      where g.user_id = uid
    ),
    'gratitude_photos', (
      select coalesce(jsonb_agg(to_jsonb(gp) order by gp.created_at), '[]'::jsonb)
      from public.gratitude_photos gp
      where gp.user_id = uid
    ),
    'vision_board_items', (
      select coalesce(jsonb_agg(to_jsonb(v) order by v.position, v.created_at), '[]'::jsonb)
      from public.vision_board_items v
      where v.user_id = uid
    ),
    'user_quotes', (
      select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
      from public.user_quotes q
      where q.user_id = uid
    ),
    'profile_photos', (
      select coalesce(jsonb_agg(to_jsonb(ph) order by ph.role, ph.position, ph.created_at), '[]'::jsonb)
      from public.profile_photos ph
      where ph.user_id = uid
    ),
    'profile_sharing', (
      select coalesce(to_jsonb(s), 'null'::jsonb)
      from public.profile_sharing s
      where s.user_id = uid
    ),
    'food_logs', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.eaten_on, f.created_at), '[]'::jsonb)
      from public.food_logs f
      where f.user_id = uid
    ),
    'nutrition_settings', (
      select coalesce(to_jsonb(n), 'null'::jsonb)
      from public.nutrition_settings n
      where n.user_id = uid
    ),
    'nutrition_days', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]'::jsonb)
      from public.nutrition_days d
      where d.user_id = uid
    ),
    'body_composition', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.recorded_on, b.created_at), '[]'::jsonb)
      from public.body_composition b
      where b.user_id = uid
    ),
    'health_plans', (
      select coalesce(to_jsonb(hp), 'null'::jsonb)
      from public.health_plans hp
      where hp.user_id = uid
    ),
    'training_schedules', (
      select coalesce(to_jsonb(ts), 'null'::jsonb)
      from public.training_schedules ts
      where ts.user_id = uid
    ),
    'garmin_connection', (
      select coalesce(jsonb_build_object(
        'garmin_user_id', g.garmin_user_id,
        'scopes', g.scopes,
        'permissions', g.permissions,
        'connected_at', g.connected_at,
        'revoked_at', g.revoked_at
      ), 'null'::jsonb)
      from public.garmin_connections g
      where g.user_id = uid
    ),
    'garmin_dailies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'calendar_date', d.calendar_date,
        'resting_heart_rate_bpm', d.resting_heart_rate_bpm,
        'average_heart_rate_bpm', d.average_heart_rate_bpm,
        'moderate_minutes', d.moderate_minutes,
        'vigorous_minutes', d.vigorous_minutes
      ) order by d.calendar_date), '[]'::jsonb)
      from public.garmin_dailies d
      where d.user_id = uid
    ),
    'garmin_activities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', a.summary_id,
        'activity_type', a.activity_type,
        'activity_name', a.activity_name,
        'started_at', a.started_at,
        'duration_seconds', a.duration_seconds,
        'average_heart_rate_bpm', a.average_heart_rate_bpm,
        'training_effect', a.training_effect,
        'anaerobic_effect', a.anaerobic_effect
      ) order by a.started_at), '[]'::jsonb)
      from public.garmin_activities a
      where a.user_id = uid
    ),
    'garmin_sleep', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', s.summary_id,
        'calendar_date', s.calendar_date,
        'duration_seconds', s.duration_seconds,
        'deep_seconds', s.deep_seconds,
        'light_seconds', s.light_seconds,
        'rem_seconds', s.rem_seconds,
        'awake_seconds', s.awake_seconds,
        'sleep_score', s.sleep_score
      ) order by s.calendar_date), '[]'::jsonb)
      from public.garmin_sleep s
      where s.user_id = uid
    )
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
