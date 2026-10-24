-- Not applied. Ben approves before this runs.
-- Optional private target weight on the owner's nutrition settings.
-- Null until they set one. Kilograms are canonical. The date is optional.
-- No policy change. shared_nutrition does not read these columns.

alter table public.nutrition_settings
  add column if not exists target_weight_kg numeric
    check (target_weight_kg is null or (target_weight_kg >= 30 and target_weight_kg <= 300)),
  add column if not exists target_on date,
  add column if not exists target_start_kg numeric
    check (target_start_kg is null or (target_start_kg >= 30 and target_start_kg <= 300));
