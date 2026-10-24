-- Garmin user metrics (VO2 max). Not applied from this repo. Ben reviews this file before it runs.
-- Adds garmin_user_metrics. Owner can select. Authenticated cannot insert, update, or delete.
-- Service role writes from the webhook. Deleting the profile cascades these rows.
-- Replaces export_my_data so a download includes these rows and keeps every previous key.
-- Does not change shared_health_days. VO2 max is not one of the shared health boxes.

create table public.garmin_user_metrics (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  vo2_max numeric(4, 1),
  vo2_max_cycling numeric(4, 1),
  fitness_age integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  check (vo2_max is null or vo2_max between 1 and 100),
  check (vo2_max_cycling is null or vo2_max_cycling between 1 and 100),
  check (fitness_age is null or fitness_age between 1 and 120)
);

create unique index garmin_user_metrics_summary_id
  on public.garmin_user_metrics (summary_id);

alter table public.garmin_user_metrics enable row level security;

create policy garmin_user_metrics_own on public.garmin_user_metrics
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.garmin_user_metrics from public, anon, authenticated;
grant all on table public.garmin_user_metrics to service_role;
grant select on table public.garmin_user_metrics to authenticated;

comment on table public.garmin_user_metrics is
  'Own Garmin VO2 max and fitness age. Owner can read. No insert or update for authenticated. No path is stored.';

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
    )
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
