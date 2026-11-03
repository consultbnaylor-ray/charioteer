-- Not applied. Ben approves before this runs.
-- A fitness-age aim beside the weight goal. Existing row policies and the table grant already cover a new column.
-- No new policy. Anonymous users still have no access.

alter table public.nutrition_settings
  add column if not exists fitness_goal text
    check (fitness_goal is null or fitness_goal in ('normal', 'younger_2', 'younger_5', 'younger_10', 'elite'));
