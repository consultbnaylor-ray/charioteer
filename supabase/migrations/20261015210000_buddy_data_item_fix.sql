-- shared_buddy_data failed with 42702 ("column reference item is ambiguous") whenever a buddy
-- was given Meals, Calories or Fat quality: the function's own variable `item` clashed with the
-- `item` column of jsonb_array_elements in those queries. The variable is renamed plan_item.
-- Nothing else changes. No table or data changes.

CREATE OR REPLACE FUNCTION public.shared_buddy_data(owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  plan_item jsonb;
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
    for plan_item in
      select value from public.health_plans p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.focus) = 'array' then p.focus else '[]'::jsonb end)
      where p.user_id = owner
    loop
      line := public.buddy_redact(plan_item ->> 'text');
      if line is null then
        continue;
      end if;
      done := coalesce((plan_item ->> 'done')::boolean, false);
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
