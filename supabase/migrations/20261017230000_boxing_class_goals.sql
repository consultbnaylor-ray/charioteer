-- Build 32. Additive. Not applied from this repo.
-- Lets Nutrition save a super middleweight, light heavyweight, or cruiserweight goal.
-- Existing elite_heavy_boxer and elite_middle_boxer rows stay as they are.
-- A save of a new goal fails until nutrition_settings_goal_check allows it.
-- nutrition_goal_label has to name them or a shared card falls back to plain text.
-- shared_nutrition still flags a low BMI only for elite_middle_boxer among boxers
-- (see 20261016140000_shared_meal_photos.sql). That list should gain
-- elite_super_middle_boxer, elite_light_heavy_boxer, and elite_cruiser_boxer
-- the next time shared_nutrition is replaced. This file does not replace it.

alter table public.nutrition_settings
  drop constraint if exists nutrition_settings_goal_check;

alter table public.nutrition_settings
  add constraint nutrition_settings_goal_check
  check (goal is null or goal in (
    'lose_weight',
    'lose_fat_build_muscle',
    'maintain',
    'increase',
    'elite_runner',
    'body_builder',
    'elite_middle_boxer',
    'elite_super_middle_boxer',
    'elite_light_heavy_boxer',
    'elite_cruiser_boxer',
    'elite_heavy_boxer'
  ));

create or replace function public.nutrition_goal_label(goal text, fallback text)
returns text
language sql
immutable
as $$
  select case goal
    when 'lose_weight' then 'Lose Weight'
    when 'lose_fat_build_muscle' then 'Lose Fat & Build Muscle'
    when 'maintain' then 'Maintain Weight'
    when 'increase' then 'Increase Weight'
    when 'elite_runner' then 'Elite Athlete (Lean Runner etc.)'
    when 'body_builder' then 'Body Builder'
    when 'elite_middle_boxer' then 'Elite Athlete (Middle Weight Boxer)'
    when 'elite_super_middle_boxer' then 'Elite Athlete (Super Middleweight Boxer)'
    when 'elite_light_heavy_boxer' then 'Elite Athlete (Light Heavyweight Boxer)'
    when 'elite_cruiser_boxer' then 'Elite Athlete (Cruiserweight Boxer)'
    when 'elite_heavy_boxer' then 'Elite Athlete (Heavy Weight Boxer)'
    else fallback
  end;
$$;

revoke all on function public.nutrition_goal_label(text, text) from public, anon, authenticated;
