-- Workout mix: conditioning minutes, per-type minutes, and a per-user type choice.
-- The build check on nutrition_settings is unchanged.
-- Additive. Not applied from this repo.

alter table public.health_samples drop constraint if exists health_samples_kind_check;

alter table public.health_samples add constraint health_samples_kind_check
  check (
    kind in (
      'steps',
      'sleep_hours',
      'resting_heart_rate',
      'hrv_sdnn',
      'workout_minutes',
      'weight_kg',
      'vo2_max',
      'walking_heart_rate',
      'heart_rate_recovery',
      'strength_minutes',
      'cardio_minutes',
      'conditioning_minutes',
      'other_minutes',
      'session_heart_rate'
    )
    or kind ~ '^workout_type_[1-9][0-9]{0,3}$'
  );

alter table public.nutrition_settings
  add column if not exists workout_buckets jsonb not null default '{}'::jsonb;

create or replace function public.workout_buckets_ok(buckets jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(jsonb_typeof(buckets) = 'object', false)
    and char_length(buckets::text) <= 2000
    and not exists (
      select 1
      from jsonb_each_text(buckets) as item
      where item.key !~ '^[1-9][0-9]{0,3}$'
        or item.value not in ('strength', 'cardio', 'conditioning', 'other')
    );
$$;

alter table public.nutrition_settings
  drop constraint if exists nutrition_settings_workout_buckets_check;

alter table public.nutrition_settings
  add constraint nutrition_settings_workout_buckets_check
  check (public.workout_buckets_ok(workout_buckets));
