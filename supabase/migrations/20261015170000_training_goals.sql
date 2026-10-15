-- Build 23. Additive. Not applied from this repo.
-- Elite runner, body builder, and combat-sport goals.
-- Existing rows keep a null phase, null targets, and the goals they already saved.

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
    and pg_get_constraintdef(c.oid) ilike '%lose_weight%'
    and pg_get_constraintdef(c.oid) not ilike '%elite_runner%';
  if cons is not null then
    execute format('alter table public.nutrition_settings drop constraint %I', cons);
  end if;
end $$;

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
    'elite_boxer'
  ));

alter table public.nutrition_settings
  add column if not exists carb_target_g numeric
    check (carb_target_g is null or (carb_target_g >= 0 and carb_target_g <= 1000)),
  add column if not exists fat_target_g numeric
    check (fat_target_g is null or (fat_target_g >= 0 and fat_target_g <= 400)),
  add column if not exists goal_phase text
    check (goal_phase is null or goal_phase in ('surplus', 'cut')),
  add column if not exists weight_class_kg numeric
    check (weight_class_kg is null or (weight_class_kg >= 40 and weight_class_kg <= 200));

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
    when 'elite_boxer' then 'Elite Athlete (Mid to Heavy Boxer etc.)'
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
         settings.goal in ('lose_weight', 'lose_fat_build_muscle', 'elite_runner', 'elite_boxer')
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

create or replace function public.shared_health_plan(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  owner public.profiles%rowtype;
  settings jsonb;
  plan_focus jsonb;
  goal text;
  headline text;
  focus jsonb := '[]'::jsonb;
  item jsonb;
  line text;
  done boolean;
  ticked integer := 0;
  total integer := 0;
begin
  if uid is null or target is null then
    return null;
  end if;

  select * into owner from public.profiles where id = target;
  if not found or owner.community_visible is not true or owner.age_confirmed_18 is not true then
    return null;
  end if;

  if uid is distinct from target and not public.viewer_in_community() then
    return null;
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = uid)
  ) then
    return null;
  end if;

  select s.settings into settings from public.profile_sharing s where s.user_id = target;
  if coalesce((settings->>'healthPlan')::boolean, false) is not true then
    return null;
  end if;

  select hp.focus into plan_focus from public.health_plans hp where hp.user_id = target;
  if plan_focus is null or jsonb_typeof(plan_focus) is distinct from 'array' then
    return null;
  end if;

  select ns.goal into goal from public.nutrition_settings ns where ns.user_id = target;
  headline := public.nutrition_goal_label(goal, 'Health plan');

  for item in select value from jsonb_array_elements(plan_focus)
  loop
    line := coalesce(item->>'text', '');
    line := regexp_replace(line, '\m\d[\d,.]*[[:space:]]*(kcal|kg|g|cm|steps|bpm|hours?)\M', '', 'gi');
    line := regexp_replace(line, '\m\d[\d,.]*[[:space:]]*%', '', 'g');
    line := regexp_replace(line, '\m(bmi|body fat|waist|lean mass)\M[[:space:]]*\d[\d,.]*', '', 'gi');
    line := regexp_replace(line, '\m\d[\d,.]*[[:space:]]*(bmi|body fat|waist|lean mass)\M', '', 'gi');
    line := regexp_replace(line, '[[:space:]]+', ' ', 'g');
    line := btrim(regexp_replace(line, '[[:space:]]+([,.;:])', '\1', 'g'));
    if line = '' or line !~ '[[:alnum:]]' then
      continue;
    end if;
    done := coalesce((item->>'done')::boolean, false);
    focus := focus || jsonb_build_array(jsonb_build_object('text', line, 'done', done));
    total := total + 1;
    if done then
      ticked := ticked + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'headline', headline,
    'focus', focus,
    'ticked', ticked,
    'total', total
  );
end;
$function$;

revoke all on function public.shared_health_plan(uuid) from public, anon;
grant execute on function public.shared_health_plan(uuid) to authenticated;

create or replace function public.shared_buddy_data(owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  invite public.buddy_invites%rowtype;
  scope jsonb;
  person_name text;
  london date := (timezone('Europe/London', now()))::date;
  share_meals boolean;
  share_kcal boolean;
  share_quality boolean;
  share_goal boolean;
  share_progress boolean;
  share_checkins boolean;
  share_gratitude boolean;
  share_vision boolean;
  share_plan boolean;
  share_health boolean;
  meals jsonb;
  calories text;
  quality text;
  goal_line text;
  progress text;
  checkins text;
  gratitude jsonb;
  vision jsonb;
  plan jsonb;
  health jsonb;
  kcal numeric;
  protein numeric;
  unsaturated numeric;
  other_fat numeric;
  progress_days integer;
  cursor date;
  mood smallint;
  mood_days integer;
  goal_key text;
  headline text;
  focus jsonb := '[]'::jsonb;
  item jsonb;
  line text;
  done boolean;
  ticked integer := 0;
  total integer := 0;
  statement text;
begin
  if uid is null or owner is null or uid = owner then
    return null;
  end if;
  select * into invite
  from public.buddy_invites
  where owner_id = owner and buddy_id = uid and status = 'accepted' and revoked_at is null;
  if invite.id is null then
    return null;
  end if;
  if not public.buddy_is_adult(uid) or not public.buddy_is_adult(owner) or public.buddy_pair_blocked(uid, owner) then
    return null;
  end if;

  scope := public.buddy_scope(invite.scope);
  share_meals := coalesce((scope ->> 'meals')::boolean, false);
  share_kcal := coalesce((scope ->> 'calories')::boolean, false);
  share_quality := coalesce((scope ->> 'quality')::boolean, false);
  share_goal := coalesce((scope ->> 'goal')::boolean, false);
  share_progress := coalesce((scope ->> 'progress')::boolean, false);
  share_checkins := coalesce((scope ->> 'checkIns')::boolean, false);
  share_gratitude := coalesce((scope ->> 'gratitude')::boolean, false);
  share_vision := coalesce((scope ->> 'vision')::boolean, false);
  share_plan := coalesce((scope ->> 'healthPlan')::boolean, false);
  share_health := coalesce((scope ->> 'healthData')::boolean, false);

  select coalesce(nullif(btrim(display_name), ''), 'Member') into person_name
  from public.profiles where id = owner;

  if share_meals then
    select coalesce(jsonb_agg(jsonb_build_object('meal', meal_row.meal, 'detail', meal_row.detail) order by meal_row.created_at), '[]'::jsonb)
    into meals
    from (
      select
        f.meal,
        f.created_at,
        coalesce((
          select string_agg(item ->> 'name', ', ' order by listed.ord)
          from jsonb_array_elements(case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end)
            with ordinality as listed(item, ord)
          where coalesce(item ->> 'name', '') <> ''
        ), 'Meal') as detail
      from public.food_logs f
      where f.user_id = owner and f.eaten_on = london
    ) meal_row;
  end if;

  if share_kcal or share_quality then
    select
      coalesce(sum(nullif(item ->> 'kcal', '')::numeric), 0),
      coalesce(sum(nullif(item ->> 'proteinG', '')::numeric), 0),
      coalesce(sum(nullif(item ->> 'unsaturatedG', '')::numeric), 0),
      coalesce(sum(nullif(item ->> 'saturatedG', '')::numeric), 0) + coalesce(sum(nullif(item ->> 'transG', '')::numeric), 0)
    into kcal, protein, unsaturated, other_fat
    from public.food_logs f
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end
    ) as item
    where f.user_id = owner and f.eaten_on = london;
  end if;

  if share_kcal then
    if coalesce(kcal, 0) = 0 and coalesce(protein, 0) = 0 then
      calories := 'No calories or macros logged today.';
    else
      calories := round(coalesce(kcal, 0))::text || ' kcal, ' || round(coalesce(protein, 0))::text || ' g protein';
    end if;
  end if;

  if share_quality then
    if coalesce(unsaturated, 0) + coalesce(other_fat, 0) = 0 then
      quality := 'No fat logged today.';
    else
      quality := 'Unsaturated fat ' || round(unsaturated)::text || ' g. Other fat ' || round(other_fat)::text || ' g.';
    end if;
  end if;

  if share_goal then
    select goal into goal_key from public.nutrition_settings where user_id = owner;
    goal_line := public.nutrition_goal_label(goal_key, 'Nutrition goal');
  end if;

  if share_progress then
    if exists (select 1 from public.food_logs f where f.user_id = owner and f.eaten_on = london) then
      cursor := london;
    elsif exists (select 1 from public.food_logs f where f.user_id = owner and f.eaten_on = london - 1) then
      cursor := london - 1;
    else
      progress_days := 0;
    end if;
    if progress_days is null then
      progress_days := 0;
      while progress_days < 366 and exists (
        select 1 from public.food_logs f where f.user_id = owner and f.eaten_on = cursor
      ) loop
        progress_days := progress_days + 1;
        cursor := cursor - 1;
      end loop;
    end if;
    progress := 'Meals logged ' || progress_days::text || ' days in a row.';
  end if;

  if share_checkins then
    select c.mood into mood
    from public.check_ins c
    where c.user_id = owner
    order by c.created_at desc
    limit 1;
    if mood is null then
      checkins := 'No check-in yet.';
    else
      if exists (
        select 1 from public.check_ins c
        where c.user_id = owner and (timezone('Europe/London', c.created_at))::date = london
      ) then
        cursor := london;
      else
        cursor := london - 1;
      end if;
      mood_days := 0;
      while mood_days < 366 and exists (
        select 1 from public.check_ins c
        where c.user_id = owner and (timezone('Europe/London', c.created_at))::date = cursor
      ) loop
        mood_days := mood_days + 1;
        cursor := cursor - 1;
      end loop;
      checkins := 'Mood ' || mood::text || '. Checked in ' || mood_days::text || ' days in a row.';
    end if;
  end if;

  if share_gratitude then
    select coalesce(jsonb_agg(entry.body), '[]'::jsonb) into gratitude
    from (
      select g.body
      from public.gratitude_entries g
      where g.user_id = owner
      order by g.entry_date desc, g.created_at desc
      limit 12
    ) entry;
  end if;

  if share_vision then
    select vision_statement into statement from public.profiles where id = owner;
    select coalesce(jsonb_agg(lines.caption order by lines.ord), '[]'::jsonb) into vision
    from (
      select caption, ord
      from (
        select nullif(btrim(statement), '') as caption, 0 as ord
        union all
        select nullif(btrim(v.caption), ''), v.position + 1
        from public.vision_board_items v
        where v.user_id = owner
      ) trimmed
      where caption is not null
      order by ord
      limit 12
    ) lines;
  end if;

  if share_plan then
    select goal into goal_key from public.nutrition_settings where user_id = owner;
    headline := public.nutrition_goal_label(goal_key, 'Health plan');
    for item in
      select value from public.health_plans p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.focus) = 'array' then p.focus else '[]'::jsonb end)
      where p.user_id = owner
    loop
      line := public.buddy_redact(item ->> 'text');
      if line is null then
        continue;
      end if;
      done := coalesce((item ->> 'done')::boolean, false);
      focus := focus || jsonb_build_array(jsonb_build_object('text', line, 'done', done));
      total := total + 1;
      if done then
        ticked := ticked + 1;
      end if;
    end loop;
    if exists (select 1 from public.health_plans where user_id = owner) then
      plan := jsonb_build_object('headline', headline, 'focus', focus, 'ticked', ticked, 'total', total);
    end if;
  end if;

  if share_health then
    select jsonb_build_object(
      'bodyFatPct', comp.body_fat_pct,
      'leanMassKg', comp.lean_mass_kg,
      'waistCm', comp.waist_cm,
      'samples', coalesce((
        select jsonb_agg(jsonb_build_object(
          'kind', sample.kind,
          'value', sample.value,
          'recordedOn', sample.recorded_on
        ))
        from (
          select h.kind, h.value, h.recorded_on
          from public.health_samples h
          where h.user_id = owner
            and h.recorded_on >= london - 13
            and h.kind in ('steps', 'sleep_hours', 'resting_heart_rate', 'hrv_sdnn', 'workout_minutes', 'weight_kg')
          order by h.recorded_on desc
          limit 80
        ) sample
      ), '[]'::jsonb)
    )
    into health
    from (
      select c.body_fat_pct, c.lean_mass_kg, c.waist_cm
      from public.body_composition c
      where c.user_id = owner
      order by c.recorded_on desc, c.created_at desc
      limit 1
    ) comp;
    if health is null then
      health := jsonb_build_object(
        'bodyFatPct', null,
        'leanMassKg', null,
        'waistCm', null,
        'samples', coalesce((
          select jsonb_agg(jsonb_build_object(
            'kind', sample.kind,
            'value', sample.value,
            'recordedOn', sample.recorded_on
          ))
          from (
            select h.kind, h.value, h.recorded_on
            from public.health_samples h
            where h.user_id = owner
              and h.recorded_on >= london - 13
              and h.kind in ('steps', 'sleep_hours', 'resting_heart_rate', 'hrv_sdnn', 'workout_minutes', 'weight_kg')
            order by h.recorded_on desc
            limit 80
          ) sample
        ), '[]'::jsonb)
      );
    end if;
  end if;

  return jsonb_build_object(
    'ownerId', owner,
    'displayName', person_name,
    'scope', scope,
    'meals', meals,
    'calories', calories,
    'quality', quality,
    'goal', goal_line,
    'progress', progress,
    'checkIns', checkins,
    'gratitude', gratitude,
    'vision', vision,
    'healthPlan', plan,
    'healthData', health
  );
end;
$function$;

revoke all on function public.shared_buddy_data(uuid) from public, anon;
grant execute on function public.shared_buddy_data(uuid) to authenticated;
