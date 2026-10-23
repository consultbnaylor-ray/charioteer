-- Garmin daily figures and wellness summaries. Not applied from this repo. Ben reviews this file before it runs.
-- Adds the daily numbers a push already carries, plus respiration, pulse ox, and HRV summaries.
-- Sample maps and any position are not columns. Owner select only. Authenticated cannot insert, update, or delete.
-- Service role writes from the webhook. Deleting the profile cascades these rows.
-- Replaces export_my_data so a download includes the new fields and keeps every previous key.
-- These figures are not added to shared health.

alter table public.garmin_dailies
  add column if not exists steps integer,
  add column if not exists distance_metres integer,
  add column if not exists floors_climbed integer,
  add column if not exists min_heart_rate_bpm integer,
  add column if not exists max_heart_rate_bpm integer,
  add column if not exists average_stress_level integer,
  add column if not exists body_battery_charged integer,
  add column if not exists body_battery_drained integer,
  add column if not exists body_battery_highest integer,
  add column if not exists body_battery_lowest integer,
  add column if not exists step_goal integer,
  add column if not exists duration_seconds integer;

alter table public.garmin_dailies
  drop constraint if exists garmin_dailies_steps_check,
  drop constraint if exists garmin_dailies_distance_metres_check,
  drop constraint if exists garmin_dailies_floors_climbed_check,
  drop constraint if exists garmin_dailies_min_heart_rate_bpm_check,
  drop constraint if exists garmin_dailies_max_heart_rate_bpm_check,
  drop constraint if exists garmin_dailies_average_stress_level_check,
  drop constraint if exists garmin_dailies_body_battery_charged_check,
  drop constraint if exists garmin_dailies_body_battery_drained_check,
  drop constraint if exists garmin_dailies_body_battery_highest_check,
  drop constraint if exists garmin_dailies_body_battery_lowest_check,
  drop constraint if exists garmin_dailies_step_goal_check,
  drop constraint if exists garmin_dailies_duration_seconds_check;

alter table public.garmin_dailies
  add constraint garmin_dailies_steps_check check (steps is null or steps between 0 and 200000),
  add constraint garmin_dailies_distance_metres_check check (distance_metres is null or distance_metres between 0 and 500000),
  add constraint garmin_dailies_floors_climbed_check check (floors_climbed is null or floors_climbed between 0 and 1000),
  add constraint garmin_dailies_min_heart_rate_bpm_check check (min_heart_rate_bpm is null or min_heart_rate_bpm between 20 and 250),
  add constraint garmin_dailies_max_heart_rate_bpm_check check (max_heart_rate_bpm is null or max_heart_rate_bpm between 20 and 250),
  add constraint garmin_dailies_average_stress_level_check check (average_stress_level is null or average_stress_level between 0 and 100),
  add constraint garmin_dailies_body_battery_charged_check check (body_battery_charged is null or body_battery_charged between 0 and 100),
  add constraint garmin_dailies_body_battery_drained_check check (body_battery_drained is null or body_battery_drained between 0 and 100),
  add constraint garmin_dailies_body_battery_highest_check check (body_battery_highest is null or body_battery_highest between 0 and 100),
  add constraint garmin_dailies_body_battery_lowest_check check (body_battery_lowest is null or body_battery_lowest between 0 and 100),
  add constraint garmin_dailies_step_goal_check check (step_goal is null or step_goal between 0 and 200000),
  add constraint garmin_dailies_duration_seconds_check check (duration_seconds is null or duration_seconds between 0 and 86400);

comment on column public.garmin_dailies.steps is
  'Own Garmin step count for that calendar day. Owner can read. Not shared.';
comment on column public.garmin_dailies.distance_metres is
  'Own Garmin distance for that calendar day, in metres. Owner can read. Not a path.';
comment on column public.garmin_dailies.floors_climbed is
  'Own Garmin floors for that calendar day. Owner can read. Not shared.';
comment on column public.garmin_dailies.duration_seconds is
  'Own Garmin activity duration for that calendar day. The longer duplicate in one push is kept.';

create table public.garmin_respiration (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  average_breaths_per_minute numeric(4, 1),
  highest_breaths_per_minute numeric(4, 1),
  lowest_breaths_per_minute numeric(4, 1),
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  check (average_breaths_per_minute is null or average_breaths_per_minute between 1 and 80),
  check (highest_breaths_per_minute is null or highest_breaths_per_minute between 1 and 80),
  check (lowest_breaths_per_minute is null or lowest_breaths_per_minute between 1 and 80)
);

create table public.garmin_pulse_ox (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  average_spo2 numeric(4, 1),
  lowest_spo2 numeric(4, 1),
  highest_spo2 numeric(4, 1),
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  check (average_spo2 is null or average_spo2 between 50 and 100),
  check (lowest_spo2 is null or lowest_spo2 between 50 and 100),
  check (highest_spo2 is null or highest_spo2 between 50 and 100)
);

create table public.garmin_hrv (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  last_night_avg_ms integer,
  last_night_5min_high_ms integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  check (last_night_avg_ms is null or last_night_avg_ms between 1 and 300),
  check (last_night_5min_high_ms is null or last_night_5min_high_ms between 1 and 300)
);

alter table public.garmin_respiration enable row level security;
alter table public.garmin_pulse_ox enable row level security;
alter table public.garmin_hrv enable row level security;

create policy garmin_respiration_own on public.garmin_respiration
  for select to authenticated
  using (user_id = auth.uid());

create policy garmin_pulse_ox_own on public.garmin_pulse_ox
  for select to authenticated
  using (user_id = auth.uid());

create policy garmin_hrv_own on public.garmin_hrv
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.garmin_respiration from public, anon, authenticated;
revoke all on table public.garmin_pulse_ox from public, anon, authenticated;
revoke all on table public.garmin_hrv from public, anon, authenticated;

grant all on table public.garmin_respiration to service_role;
grant all on table public.garmin_pulse_ox to service_role;
grant all on table public.garmin_hrv to service_role;

grant select on table public.garmin_respiration to authenticated;
grant select on table public.garmin_pulse_ox to authenticated;
grant select on table public.garmin_hrv to authenticated;

comment on table public.garmin_respiration is
  'Own Garmin respiration summary. Owner can read. The breath-by-breath map is not stored.';
comment on table public.garmin_pulse_ox is
  'Own Garmin pulse ox summary. Owner can read. The sample map is not stored.';
comment on table public.garmin_hrv is
  'Own Garmin overnight HRV summary. Owner can read. The sample map is not stored.';

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
        'vigorous_minutes', d.vigorous_minutes,
        'active_kilocalories', d.active_kilocalories,
        'steps', d.steps,
        'distance_metres', d.distance_metres,
        'floors_climbed', d.floors_climbed,
        'min_heart_rate_bpm', d.min_heart_rate_bpm,
        'max_heart_rate_bpm', d.max_heart_rate_bpm,
        'average_stress_level', d.average_stress_level,
        'body_battery_charged', d.body_battery_charged,
        'body_battery_drained', d.body_battery_drained,
        'body_battery_highest', d.body_battery_highest,
        'body_battery_lowest', d.body_battery_lowest,
        'step_goal', d.step_goal,
        'duration_seconds', d.duration_seconds
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
    ),
    'garmin_user_metrics', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', m.summary_id,
        'calendar_date', m.calendar_date,
        'vo2_max', m.vo2_max,
        'vo2_max_cycling', m.vo2_max_cycling,
        'fitness_age', m.fitness_age
      ) order by m.calendar_date), '[]'::jsonb)
      from public.garmin_user_metrics m
      where m.user_id = uid
    ),
    'garmin_respiration', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', r.summary_id,
        'calendar_date', r.calendar_date,
        'average_breaths_per_minute', r.average_breaths_per_minute,
        'highest_breaths_per_minute', r.highest_breaths_per_minute,
        'lowest_breaths_per_minute', r.lowest_breaths_per_minute
      ) order by r.calendar_date), '[]'::jsonb)
      from public.garmin_respiration r
      where r.user_id = uid
    ),
    'garmin_pulse_ox', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', p.summary_id,
        'calendar_date', p.calendar_date,
        'average_spo2', p.average_spo2,
        'lowest_spo2', p.lowest_spo2,
        'highest_spo2', p.highest_spo2
      ) order by p.calendar_date), '[]'::jsonb)
      from public.garmin_pulse_ox p
      where p.user_id = uid
    ),
    'garmin_hrv', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', h.summary_id,
        'calendar_date', h.calendar_date,
        'last_night_avg_ms', h.last_night_avg_ms,
        'last_night_5min_high_ms', h.last_night_5min_high_ms
      ) order by h.calendar_date), '[]'::jsonb)
      from public.garmin_hrv h
      where h.user_id = uid
    )
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
