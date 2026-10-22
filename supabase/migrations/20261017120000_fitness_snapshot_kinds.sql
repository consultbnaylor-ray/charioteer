-- Daily fitness summaries for the fitness snapshot.
-- vo2_max, walking heart rate, heart-rate recovery, session heart rate,
-- and minutes split into strength, cardio, and other.
-- Additive. Not applied from this repo.

alter table public.health_samples drop constraint if exists health_samples_kind_check;

alter table public.health_samples add constraint health_samples_kind_check
  check (kind in (
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
    'other_minutes',
    'session_heart_rate'
  ));
