-- Build 23. Additive. Not applied from this repo.
-- Splits the combined boxer goal into heavyweight and middleweight.
-- A saved combined goal, which was not a released choice, is cleared so the person picks one.

do $$
declare
  cons name;
begin
  select c.conname into cons
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'nutrition_settings'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%elite_boxer%';
  if cons is not null then
    execute format('alter table public.nutrition_settings drop constraint %I', cons);
  end if;
end $$;

alter table public.nutrition_settings
  drop constraint if exists nutrition_settings_goal_check;

update public.nutrition_settings
set goal = null
where goal = 'elite_boxer';

alter table public.nutrition_settings
  add constraint nutrition_settings_goal_check
  check (goal is null or goal in (
    'lose_weight',
    'lose_fat_build_muscle',
    'maintain',
    'increase',
    'elite_runner',
    'body_builder',
    'elite_heavy_boxer',
    'elite_middle_boxer'
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
    when 'elite_heavy_boxer' then 'Elite Athlete (Heavy Weight Boxer)'
    when 'elite_middle_boxer' then 'Elite Athlete (Middle Weight Boxer)'
    else fallback
  end;
$$;

revoke all on function public.nutrition_goal_label(text, text) from public, anon, authenticated;

create or replace function public.shared_nutrition(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner public.profiles%rowtype;
  settings public.nutrition_settings%rowtype;
  has_settings boolean := false;
  share_meals boolean := false;
  share_kcal boolean := false;
  share_qual boolean := false;
  share_prog boolean := false;
  share_wagon boolean := false;
  share_the_goal boolean := false;
  hide boolean := false;
  london date := (timezone('Europe/London', now()))::date;
  cursor date := london;
  meals jsonb := '[]'::jsonb;
  kcal numeric := 0;
  protein numeric := 0;
  carbs numeric := 0;
  sugar numeric := 0;
  fibre numeric := 0;
  unsaturated numeric := 0;
  other_fat numeric := 0;
  progress_days integer := null;
  weight_days integer := 0;
  earlier_kg numeric := null;
  latest_kg numeric := null;
  direction text := 'unknown';
  bmi_low boolean := false;
  fat_pct numeric := null;
  lean_kg numeric := null;
  waist numeric := null;
  composition text := null;
begin
  if uid is null or target is null then
    return null;
  end if;

  select * into owner from public.profiles where id = target;
  if not found or owner.community_visible is not true or owner.age_confirmed_18 is not true then
    return null;
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = uid)
  ) then
    return null;
  end if;

  select * into settings from public.nutrition_settings where user_id = target;
  has_settings := found;
  if has_settings then
    share_meals := settings.share_food_diary;
    share_kcal := settings.share_calories;
    share_qual := settings.share_quality;
    share_prog := settings.share_progress;
    share_wagon := settings.wagon_on and settings.wagon_visible;
    share_the_goal := settings.share_goal and settings.goal is not null;
    hide := settings.hide_calories;
  end if;

  if share_meals then
    select coalesce(jsonb_agg(meal_row.payload order by meal_row.created_at), '[]'::jsonb)
      into meals
    from (
      select f.created_at,
        jsonb_build_object(
          'meal', f.meal,
          'note', f.note,
          'estimated', f.estimated,
          'names', coalesce((
            select string_agg(item->>'name', ', ' order by listed.ord)
            from jsonb_array_elements(
              case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end
            ) with ordinality as listed(item, ord)
            where coalesce(item->>'name', '') <> ''
          ), '')
        ) as payload
      from public.food_logs f
      where f.user_id = target
        and f.eaten_on = london
    ) meal_row;
  end if;

  if share_kcal or share_qual or share_the_goal then
    select
      coalesce(sum(nullif(item->>'kcal', '')::numeric), 0),
      coalesce(sum(nullif(item->>'proteinG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'carbsG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'sugarG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'fibreG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'unsaturatedG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'saturatedG', '')::numeric), 0) + coalesce(sum(nullif(item->>'transG', '')::numeric), 0)
      into kcal, protein, carbs, sugar, fibre, unsaturated, other_fat
    from public.food_logs f
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end
    ) as item
    where f.user_id = target
      and f.eaten_on = london;
  end if;

  if share_prog then
    if exists (
      select 1 from public.food_logs f where f.user_id = target and f.eaten_on = london
    ) then
      cursor := london;
    elsif exists (
      select 1 from public.food_logs f where f.user_id = target and f.eaten_on = london - 1
    ) then
      cursor := london - 1;
    else
      progress_days := 0;
    end if;
    if progress_days is null then
      progress_days := 0;
      while progress_days < 366 and exists (
        select 1 from public.food_logs f where f.user_id = target and f.eaten_on = cursor
      ) loop
        progress_days := progress_days + 1;
        cursor := cursor - 1;
      end loop;
    end if;
  end if;

  if share_the_goal then
    select count(*) into weight_days
    from (
      select h.recorded_on
      from public.health_samples h
      where h.user_id = target and h.kind = 'weight_kg'
      group by h.recorded_on
    ) days;

    select h.value into latest_kg
    from public.health_samples h
    where h.user_id = target and h.kind = 'weight_kg'
    order by h.recorded_on desc
    limit 1;

    if weight_days >= 2 then
      select h.value into earlier_kg
      from public.health_samples h
      where h.user_id = target and h.kind = 'weight_kg'
      order by h.recorded_on asc
      limit 1;

      if latest_kg - earlier_kg <= -0.3 then
        direction := 'down';
      elsif latest_kg - earlier_kg >= 0.3 then
        direction := 'up';
      else
        direction := 'steady';
      end if;
    end if;

    if latest_kg is not null and owner.height_cm is not null and owner.height_cm > 0
       and (
         settings.goal in ('lose_weight', 'lose_fat_build_muscle', 'elite_runner', 'elite_middle_boxer')
         or (settings.goal = 'body_builder' and settings.goal_phase = 'cut')
       )
       and (latest_kg / power(owner.height_cm / 100.0, 2)) < 18.5 then
      bmi_low := true;
    end if;
  end if;


  if share_prog then
    select b.body_fat_pct into fat_pct
    from public.body_composition b
    where b.user_id = target and b.body_fat_pct is not null
    order by b.recorded_on desc, b.created_at desc
    limit 1;

    select b.lean_mass_kg into lean_kg
    from public.body_composition b
    where b.user_id = target and b.lean_mass_kg is not null
    order by b.recorded_on desc, b.created_at desc
    limit 1;

    select b.waist_cm into waist
    from public.body_composition b
    where b.user_id = target and b.waist_cm is not null
    order by b.recorded_on desc, b.created_at desc
    limit 1;

    if fat_pct is not null then
      composition := 'Body fat ' || regexp_replace(round(fat_pct, 1)::text, '\\.0$', '') || '%.';
    elsif waist is not null and owner.height_cm is not null and owner.height_cm > 0 then
      if (waist / owner.height_cm) < 0.5 then
        composition := 'Waist is less than half their height.';
      else
        composition := 'Waist-to-height is 0.5 or more.';
      end if;
    elsif lean_kg is not null then
      composition := 'Lean body mass is recorded.';
    end if;
  end if;

  return jsonb_build_object(
    'mealsShared', share_meals,
    'meals', case when share_meals then meals else '[]'::jsonb end,
    'calories', case when share_kcal then jsonb_build_object(
      'kcal', case when hide then null else round(kcal) end,
      'proteinG', round(protein, 1),
      'carbsG', round(carbs, 1),
      'sugarG', round(sugar, 1),
      'fibreG', round(fibre, 1)
    ) else null end,
    'quality', case when share_qual then jsonb_build_object(
      'unsaturatedG', round(unsaturated, 1),
      'otherG', round(other_fat, 1)
    ) else null end,
    'progressDays', progress_days,
    'composition', composition,
    'wagonOn', share_wagon,
    'wagonNote', case when share_wagon and has_settings then settings.wagon_note else '' end,
    'goal', case when share_the_goal then jsonb_build_object(
      'id', settings.goal,
      'proteinG', round(protein, 1),
      'proteinTargetG', settings.protein_target_g,
      'direction', direction,
      'hideCalories', hide,
      'bmiLow', bmi_low
    ) else null end
  );
end;
$$;

revoke all on function public.shared_nutrition(uuid) from public, anon;
grant execute on function public.shared_nutrition(uuid) to authenticated;
