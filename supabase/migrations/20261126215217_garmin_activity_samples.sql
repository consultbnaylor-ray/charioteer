-- Garmin route maps. Approved by Ben on 26 November 2026 ("Just build the whole thing with everything that's needed").
-- 1. garmin_activity_detail gains the start point (4 decimal places, about 11 m) and the climb and descent.
-- 2. garmin_activity_samples keeps one downsampled track per Garmin activity: one point every 5 s
--    (longer only past about 2 h 45 min), at most 2000 points. Each point is
--    [offset seconds, latitude, longitude, elevation m, heart rate bpm, speed m/s, distance m];
--    latitude and longitude are rounded to 5 decimal places, about 1 m.
-- Owner select only. Service role writes from garmin-webhook. Deleted with the account (cascade),
-- on Garmin disconnect, and by account-delete (GARMIN_SUMMARY_TABLES). Not sent to the coach or any model.
-- 3. export_my_data gains the activity details and a per-activity track summary. Track coordinates are
--    left out of the download, the same rule as saved routes.

alter table public.garmin_activity_detail
  add column if not exists start_latitude double precision,
  add column if not exists start_longitude double precision,
  add column if not exists elevation_gain_metres integer,
  add column if not exists elevation_loss_metres integer;

alter table public.garmin_activity_detail
  add constraint garmin_activity_detail_start_latitude check (start_latitude is null or start_latitude between -90 and 90),
  add constraint garmin_activity_detail_start_longitude check (start_longitude is null or start_longitude between -180 and 180),
  add constraint garmin_activity_detail_climb check (
    (elevation_gain_metres is null or elevation_gain_metres between 0 and 20000)
    and (elevation_loss_metres is null or elevation_loss_metres between 0 and 20000)
  );

create table if not exists public.garmin_activity_samples (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  started_at timestamptz not null,
  interval_seconds integer not null,
  point_count integer not null,
  gps_point_count integer not null,
  points jsonb not null,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (interval_seconds between 1 and 60),
  check (point_count between 1 and 2000),
  check (gps_point_count between 0 and point_count),
  check (jsonb_typeof(points) = 'array'),
  check (jsonb_array_length(points) = point_count),
  check (pg_column_size(points) <= 400000)
);

alter table public.garmin_activity_samples enable row level security;
drop policy if exists garmin_activity_samples_own on public.garmin_activity_samples;
create policy garmin_activity_samples_own on public.garmin_activity_samples for select to authenticated using (user_id = auth.uid());
revoke all on table public.garmin_activity_samples from public, anon, authenticated;
grant all on table public.garmin_activity_samples to service_role;
grant select on table public.garmin_activity_samples to authenticated;

comment on table public.garmin_activity_detail is
  'Own Garmin activity-detail totals, the start point (about 11 m) and climb. The full track is in garmin_activity_samples.';
comment on table public.garmin_activity_samples is
  'Own downsampled Garmin activity track (time, position, elevation, heart rate, speed, distance) for the route map. Owner read only. Not sent to the coach or any model. Not shared.';

do $migration$
declare
  def text;
  marker constant text := '''garmin_hrv'', (';
  addition constant text := $add$'garmin_activity_detail', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', gd.summary_id,
        'calendar_date', gd.calendar_date,
        'duration_seconds', gd.duration_seconds,
        'distance_metres', gd.distance_metres,
        'average_heart_rate_bpm', gd.average_heart_rate_bpm,
        'active_kilocalories', gd.active_kilocalories,
        'elevation_gain_metres', gd.elevation_gain_metres,
        'elevation_loss_metres', gd.elevation_loss_metres
      ) order by gd.calendar_date), '[]'::jsonb)
      from public.garmin_activity_detail gd
      where gd.user_id = uid
    ),
    'garmin_activity_samples', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', gs.summary_id,
        'calendar_date', gs.calendar_date,
        'started_at', gs.started_at,
        'point_count', gs.point_count,
        'gps_point_count', gs.gps_point_count
      ) order by gs.started_at), '[]'::jsonb)
      from public.garmin_activity_samples gs
      where gs.user_id = uid
    ),
    $add$;
begin
  def := pg_get_functiondef('public.export_my_data()'::regprocedure);
  if position('''garmin_activity_samples''' in def) > 0 then
    return;
  end if;
  if (length(def) - length(replace(def, marker, ''))) / length(marker) <> 1 then
    raise exception 'export_my_data: expected one garmin_hrv entry';
  end if;
  execute replace(def, marker, addition || marker);
end
$migration$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
