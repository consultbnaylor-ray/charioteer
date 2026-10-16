-- Today's meal photos on a shared profile.
-- shared_nutrition adds mealPhotos only when Share today's meals is on.
-- Each photo is today's meal, and the file is that meal's own object.
-- Other members can read a food-photos object only while food_photo_shared
-- still says that meal is shared. Older meals stay private.
-- No new table and no select grant on food_logs. Not applied from here.

CREATE OR REPLACE FUNCTION public.shared_nutrition(target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  share_body boolean := false;
  hide boolean := false;
  london date := (timezone('Europe/London', now()))::date;
  cursor date := london;
  meals jsonb := '[]'::jsonb;
  photos jsonb := '[]'::jsonb;
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

  if uid is distinct from target and not public.viewer_in_community() then
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

  select coalesce(s.settings->'shareBodyFigures' = 'true'::jsonb, false)
    into share_body
  from public.profile_sharing s
  where s.user_id = target;
  if not found then
    share_body := false;
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

  if share_meals then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id,
      'meal', f.meal
    ) order by f.created_at), '[]'::jsonb)
      into photos
    from public.food_logs f
    where f.user_id = target
      and f.eaten_on = london
      and f.photo_path is not null
      and f.photo_path = f.user_id::text || '/' || f.id::text || '.jpg'
      and f.photo_path not like '%..%';
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


  if share_prog or share_body then
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
    'mealPhotos', case when share_meals then photos else null end,
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
$function$;


revoke all on function public.shared_nutrition(uuid) from public, anon;
grant execute on function public.shared_nutrition(uuid) to authenticated;

-- True only for a meal photo the owner is sharing today.
create or replace function public.food_photo_shared(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and coalesce(public.viewer_in_community(), false)
    and object_name is not null
    and object_name not like '%..%'
    and object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and exists (
      select 1
      from public.food_logs f
      join public.profiles owner on owner.id = f.user_id
      join public.nutrition_settings settings on settings.user_id = f.user_id
      where f.photo_path = object_name
        and f.photo_path = f.user_id::text || '/' || f.id::text || '.jpg'
        and f.eaten_on = (timezone('Europe/London', now()))::date
        and settings.share_food_diary is true
        and owner.community_visible is true
        and owner.age_confirmed_18 is true
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = f.user_id)
             or (b.blocker_id = f.user_id and b.blocked_id = auth.uid())
        )
    );
$$;

revoke all on function public.food_photo_shared(text) from public, anon;
grant execute on function public.food_photo_shared(text) to authenticated;

drop policy if exists food_photos_storage_shared_read on storage.objects;
create policy food_photos_storage_shared_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'food-photos'
    and name not like '%..%'
    and public.food_photo_shared(name)
  );
