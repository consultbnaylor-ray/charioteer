-- More Garmin summaries. Not applied from this repo. Ben reviews this file before it runs.
-- Scalar fields only. No sample maps, no file callbacks, no coordinates.
-- Women's health is not a table. Owner select only. Service role writes.
-- These rows are for the person's own charts. They are not sent to the coach.

create table public.garmin_blood_pressure (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  systolic integer,
  diastolic integer,
  pulse_bpm integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (systolic is null or systolic between 40 and 250),
  check (diastolic is null or diastolic between 20 and 180),
  check (pulse_bpm is null or pulse_bpm between 20 and 250)
);

create table public.garmin_body_comp (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  weight_kg numeric(5, 1),
  body_fat_pct numeric(4, 1),
  bmi numeric(4, 1),
  muscle_mass_kg numeric(5, 1),
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (weight_kg is null or weight_kg between 20 and 400),
  check (body_fat_pct is null or body_fat_pct between 2 and 70),
  check (bmi is null or bmi between 10 and 80),
  check (muscle_mass_kg is null or muscle_mass_kg between 5 and 200)
);

create table public.garmin_skin_temp (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  deviation_c numeric(4, 1),
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (deviation_c is null or deviation_c between -10 and 10)
);

create table public.garmin_stress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  average_stress integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (average_stress is null or average_stress between 0 and 100)
);

create table public.garmin_epoch (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  active_seconds integer,
  steps integer,
  distance_metres integer,
  mean_heart_rate_bpm integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (active_seconds is null or active_seconds between 0 and 86400),
  check (steps is null or steps between 0 and 100000),
  check (distance_metres is null or distance_metres between 0 and 200000),
  check (mean_heart_rate_bpm is null or mean_heart_rate_bpm between 20 and 250)
);

create table public.garmin_health_snapshot (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  heart_rate_bpm integer,
  resting_heart_rate_bpm integer,
  spo2 numeric(4, 1),
  respiration numeric(4, 1),
  stress integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (heart_rate_bpm is null or heart_rate_bpm between 20 and 250),
  check (resting_heart_rate_bpm is null or resting_heart_rate_bpm between 20 and 250),
  check (spo2 is null or spo2 between 50 and 100),
  check (respiration is null or respiration between 1 and 80),
  check (stress is null or stress between 0 and 100)
);

create table public.garmin_move_iq (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  activity_type text not null,
  duration_seconds integer,
  distance_metres integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (char_length(activity_type) between 1 and 40),
  check (duration_seconds is null or duration_seconds between 0 and 86400),
  check (distance_metres is null or distance_metres between 0 and 500000)
);

create table public.garmin_activity_detail (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  duration_seconds integer,
  distance_metres integer,
  average_heart_rate_bpm integer,
  active_kilocalories integer,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (duration_seconds is null or duration_seconds between 0 and 86400),
  check (distance_metres is null or distance_metres between 0 and 500000),
  check (average_heart_rate_bpm is null or average_heart_rate_bpm between 20 and 250),
  check (active_kilocalories is null or active_kilocalories between 0 and 20000)
);

create table public.garmin_activity_file (
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_id text not null,
  calendar_date date not null,
  file_type text not null,
  primary key (user_id, summary_id),
  check (summary_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  check (char_length(file_type) between 1 and 40)
);

alter table public.garmin_blood_pressure enable row level security;
alter table public.garmin_body_comp enable row level security;
alter table public.garmin_skin_temp enable row level security;
alter table public.garmin_stress enable row level security;
alter table public.garmin_epoch enable row level security;
alter table public.garmin_health_snapshot enable row level security;
alter table public.garmin_move_iq enable row level security;
alter table public.garmin_activity_detail enable row level security;
alter table public.garmin_activity_file enable row level security;

create policy garmin_blood_pressure_own on public.garmin_blood_pressure for select to authenticated using (user_id = auth.uid());
create policy garmin_body_comp_own on public.garmin_body_comp for select to authenticated using (user_id = auth.uid());
create policy garmin_skin_temp_own on public.garmin_skin_temp for select to authenticated using (user_id = auth.uid());
create policy garmin_stress_own on public.garmin_stress for select to authenticated using (user_id = auth.uid());
create policy garmin_epoch_own on public.garmin_epoch for select to authenticated using (user_id = auth.uid());
create policy garmin_health_snapshot_own on public.garmin_health_snapshot for select to authenticated using (user_id = auth.uid());
create policy garmin_move_iq_own on public.garmin_move_iq for select to authenticated using (user_id = auth.uid());
create policy garmin_activity_detail_own on public.garmin_activity_detail for select to authenticated using (user_id = auth.uid());
create policy garmin_activity_file_own on public.garmin_activity_file for select to authenticated using (user_id = auth.uid());

revoke all on table public.garmin_blood_pressure from public, anon, authenticated;
revoke all on table public.garmin_body_comp from public, anon, authenticated;
revoke all on table public.garmin_skin_temp from public, anon, authenticated;
revoke all on table public.garmin_stress from public, anon, authenticated;
revoke all on table public.garmin_epoch from public, anon, authenticated;
revoke all on table public.garmin_health_snapshot from public, anon, authenticated;
revoke all on table public.garmin_move_iq from public, anon, authenticated;
revoke all on table public.garmin_activity_detail from public, anon, authenticated;
revoke all on table public.garmin_activity_file from public, anon, authenticated;

grant all on table public.garmin_blood_pressure to service_role;
grant all on table public.garmin_body_comp to service_role;
grant all on table public.garmin_skin_temp to service_role;
grant all on table public.garmin_stress to service_role;
grant all on table public.garmin_epoch to service_role;
grant all on table public.garmin_health_snapshot to service_role;
grant all on table public.garmin_move_iq to service_role;
grant all on table public.garmin_activity_detail to service_role;
grant all on table public.garmin_activity_file to service_role;

grant select on table public.garmin_blood_pressure to authenticated;
grant select on table public.garmin_body_comp to authenticated;
grant select on table public.garmin_skin_temp to authenticated;
grant select on table public.garmin_stress to authenticated;
grant select on table public.garmin_epoch to authenticated;
grant select on table public.garmin_health_snapshot to authenticated;
grant select on table public.garmin_move_iq to authenticated;
grant select on table public.garmin_activity_detail to authenticated;
grant select on table public.garmin_activity_file to authenticated;

comment on table public.garmin_blood_pressure is
  'Own Garmin blood pressure. Owner can read. Not sent to the coach.';
comment on table public.garmin_body_comp is
  'Own Garmin body composition. Owner can read. Not sent to the coach.';
comment on table public.garmin_skin_temp is
  'Own Garmin skin-temperature deviation. Owner can read. Not sent to the coach.';
comment on table public.garmin_stress is
  'Own Garmin stress-detail average. The sample map is not stored. Not sent to the coach.';
comment on table public.garmin_epoch is
  'Own Garmin 15-minute epoch totals. No position. Not sent to the coach.';
comment on table public.garmin_health_snapshot is
  'Own Garmin health snapshot averages. Not sent to the coach.';
comment on table public.garmin_move_iq is
  'Own Garmin Move IQ summary. Not sent to the coach.';
comment on table public.garmin_activity_detail is
  'Own Garmin activity-detail totals. Samples and position are not stored.';
comment on table public.garmin_activity_file is
  'Own Garmin activity-file type. The file and its callback are not stored.';
