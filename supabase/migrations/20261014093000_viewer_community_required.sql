-- Viewers must have Community on, and be 18 or over, to see anyone's shared items.
-- Approved by Ben on 14 Oct. Replaces functions only. No table or data changes.
-- The owner-side rules (owner Community on, 18+, no block either way, each item
-- behind its own switch) are unchanged. A person always sees their own rows.

create or replace function public.viewer_in_community()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select community_visible is true and age_confirmed_18 is true from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.viewer_in_community() from public, anon;
grant execute on function public.viewer_in_community() to authenticated;

CREATE OR REPLACE FUNCTION public.public_profile(user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  target uuid := user_id;
  person public.profiles%rowtype;
  settings jsonb := '{}'::jsonb;
  share_town boolean := false;
  share_bio boolean := true;
  share_stage boolean := false;
  share_sober_days boolean := false;
  share_milestones boolean := false;
  share_money boolean := false;
  share_units boolean := false;
  share_mood boolean := false;
  reason_bodies text[] := array[]::text[];
  health_kinds text[] := array[]::text[];
  gratitude_ids uuid[] := array[]::uuid[];
  gratitude_photo_ids uuid[] := array[]::uuid[];
  vision_ids uuid[] := array[]::uuid[];
  interest_labels jsonb := '[]'::jsonb;
  shown_town text := null;
  shown_bio text := null;
  shown_stage text := null;
  shown_sober jsonb := null;
  shown_milestones jsonb := '[]'::jsonb;
  shown_reasons jsonb := '[]'::jsonb;
  shown_money numeric := null;
  shown_units numeric := null;
  shown_mood int := null;
  shown_health jsonb := '[]'::jsonb;
  shown_photos jsonb := '[]'::jsonb;
  shown_gratitude jsonb := '[]'::jsonb;
  shown_gratitude_photos jsonb := '[]'::jsonb;
  shown_vision jsonb := '[]'::jsonb;
  share_quote boolean := false;
  shown_quote text := null;
  shown_profile_photos jsonb := '[]'::jsonb;
  days int := 0;
  weeks numeric := 0;
  shared_labels text[] := array['Name', 'Interests'];
  hidden_labels text[] := array[]::text[];
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;
  if target is null then
    return null;
  end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = uid and blocked_id = target)
       or (blocker_id = target and blocked_id = uid)
  ) then
    return null;
  end if;

  select * into person from public.profiles where id = target;
  if not found or person.community_visible is not true or person.age_confirmed_18 is not true then
    return null;
  end if;

  if uid is distinct from target and not public.viewer_in_community() then
    return null;
  end if;

  select coalesce(s.settings, '{}'::jsonb) into settings
  from public.profile_sharing s
  where s.user_id = target;
  settings := coalesce(settings, '{}'::jsonb);
  share_town := coalesce((settings->>'town')::boolean, false);
  share_bio := coalesce((settings->>'bio')::boolean, true);
  share_stage := coalesce((settings->>'stage')::boolean, false);
  share_sober_days := coalesce((settings->>'soberDays')::boolean, (settings->>'sober')::boolean, false);
  share_milestones := coalesce((settings->>'milestones')::boolean, (settings->>'sober')::boolean, false);
  share_money := coalesce((settings->>'moneySaved')::boolean, (settings->>'savings')::boolean, false);
  share_units := coalesce((settings->>'unitsAvoided')::boolean, (settings->>'savings')::boolean, false);
  share_mood := coalesce((settings->>'moodStreak')::boolean, false);
  share_quote := coalesce((settings->>'pinnedQuote')::boolean, false);
  select coalesce(array_agg(item), array[]::text[]) into reason_bodies
  from jsonb_array_elements_text(coalesce(settings->'reasonBodies', '[]'::jsonb)) as listed(item);
  select coalesce(array_agg(item), array[]::text[]) into health_kinds
  from jsonb_array_elements_text(coalesce(settings->'healthKinds', '[]'::jsonb)) as listed(item)
  where item in ('steps', 'sleep_hours', 'resting_heart_rate', 'hrv_sdnn', 'workout_minutes', 'weight_kg');
  select coalesce(array_agg(item::uuid), array[]::uuid[]) into gratitude_ids
  from jsonb_array_elements_text(coalesce(settings->'gratitudeIds', '[]'::jsonb)) as listed(item)
  where item ~* '^[0-9a-f-]{36}$';
  select coalesce(array_agg(item::uuid), array[]::uuid[]) into gratitude_photo_ids
  from jsonb_array_elements_text(coalesce(settings->'gratitudePhotoIds', '[]'::jsonb)) as listed(item)
  where item ~* '^[0-9a-f-]{36}$';
  select coalesce(array_agg(item::uuid), array[]::uuid[]) into vision_ids
  from jsonb_array_elements_text(coalesce(settings->'visionIds', '[]'::jsonb)) as listed(item)
  where item ~* '^[0-9a-f-]{36}$';

  select coalesce(jsonb_agg(i.label order by i.label), '[]'::jsonb) into interest_labels
  from public.profile_interests pi
  join public.interests i on i.id = pi.interest_id
  where pi.user_id = target;

  if share_bio and nullif(btrim(person.bio), '') is not null then
    shown_bio := btrim(person.bio);
    shared_labels := shared_labels || 'Bio'::text;
  else
    hidden_labels := hidden_labels || 'Bio'::text;
  end if;

  if share_town and nullif(btrim(person.town), '') is not null then
    shown_town := btrim(person.town);
    shared_labels := shared_labels || 'Town'::text;
  else
    hidden_labels := hidden_labels || 'Town'::text;
  end if;

  if share_stage then
    shown_stage := case person.stage
      when 'stopped' then 'I’ve stopped'
      when 'trying_to_stop' then 'Trying to stop'
      when 'cutting_down' then 'Trying to cut down'
      when 'exploring' then 'Still drinking, just exploring'
      else null
    end;
  end if;
  if shown_stage is not null then
    shared_labels := shared_labels || 'Stage'::text;
  else
    hidden_labels := hidden_labels || 'Stage'::text;
  end if;

  if share_sober_days and person.sobriety_started_at is not null and person.sobriety_started_at <= now() then
    days := floor(extract(epoch from (now() - person.sobriety_started_at)) / 86400);
    shown_sober := jsonb_build_object(
      'days', days,
      'since', to_char(person.sobriety_started_at at time zone 'Europe/London', 'YYYY-MM-DD')
    );
    shared_labels := shared_labels || 'Days sober'::text;
  else
    hidden_labels := hidden_labels || 'Days sober'::text;
  end if;

  if share_milestones and person.sobriety_started_at is not null and person.sobriety_started_at <= now() then
    select coalesce(jsonb_agg(badge order by ord), '[]'::jsonb) into shown_milestones
    from (
      select 1 as ord, 'First day' as badge where now() >= person.sobriety_started_at + interval '24 hours'
      union all select 2, 'One week' where now() >= person.sobriety_started_at + interval '7 days'
      union all select 3, 'One month' where now() >= person.sobriety_started_at + interval '30 days'
      union all select 4, 'Ninety days' where now() >= person.sobriety_started_at + interval '90 days'
      union all select 5, 'Half year' where now() >= person.sobriety_started_at + interval '6 months'
      union all select 6, 'A year' where now() >= person.sobriety_started_at + interval '1 year'
    ) earned;
  end if;
  if shown_milestones <> '[]'::jsonb then
    shared_labels := shared_labels || 'Milestones'::text;
  else
    hidden_labels := hidden_labels || 'Milestones'::text;
  end if;

  select coalesce(jsonb_agg(r.body order by r.sort_order), '[]'::jsonb) into shown_reasons
  from public.reasons r
  where r.user_id = target
    and btrim(r.body) = any(reason_bodies);
  if shown_reasons <> '[]'::jsonb then
    shared_labels := shared_labels || 'Reasons'::text;
  else
    hidden_labels := hidden_labels || 'Reasons'::text;
  end if;

  if person.sobriety_started_at is not null then
    weeks := greatest(extract(epoch from (now() - person.sobriety_started_at)), 0) / (7 * 86400);
  end if;
  if share_money and person.sobriety_started_at is not null and person.weekly_spend_gbp is not null then
    shown_money := round(person.weekly_spend_gbp * weeks, 2);
    shared_labels := shared_labels || 'Money saved'::text;
  else
    hidden_labels := hidden_labels || 'Money saved'::text;
  end if;
  if share_units and person.sobriety_started_at is not null and person.weekly_units is not null then
    shown_units := round(person.weekly_units * weeks, 1);
    shared_labels := shared_labels || 'Units avoided'::text;
  else
    hidden_labels := hidden_labels || 'Units avoided'::text;
  end if;

  if share_mood then
    with days as (
      select distinct (created_at at time zone 'Europe/London')::date as day
      from public.check_ins
      where user_id = target
    ),
    chain as (
      select day
      from days
      where day <= (timezone('Europe/London', now()))::date
        and day >= (timezone('Europe/London', now()))::date - 400
        and not exists (
          select 1
          from generate_series(
            day + 1,
            case
              when exists (select 1 from days where day = (timezone('Europe/London', now()))::date)
                then (timezone('Europe/London', now()))::date
              else (timezone('Europe/London', now()))::date - 1
            end,
            interval '1 day'
          ) as gap(day)
          where not exists (select 1 from days known where known.day = gap.day::date)
        )
    )
    select count(*)::int into shown_mood from chain
    where exists (
      select 1 from days
      where day = (timezone('Europe/London', now()))::date
         or day = (timezone('Europe/London', now()))::date - 1
    );
    shared_labels := shared_labels || 'Mood streak'::text;
  else
    hidden_labels := hidden_labels || 'Mood streak'::text;
  end if;

  select coalesce(jsonb_agg(line order by kind), '[]'::jsonb) into shown_health
  from (
    select h.kind,
      case h.kind
        when 'steps' then 'Steps average ' || to_char(round(avg(h.value)), 'FM999,999,990') || ' steps'
        when 'sleep_hours' then 'Sleep average ' || to_char(round(avg(h.value), 1), 'FM990.0') || ' hours'
        when 'resting_heart_rate' then 'Resting heart rate average ' || to_char(round(avg(h.value)), 'FM990') || ' bpm'
        when 'hrv_sdnn' then 'Heart rate variability average ' || to_char(round(avg(h.value)), 'FM999990') || ' ms'
        when 'workout_minutes' then 'Workouts average ' || to_char(round(avg(h.value)), 'FM999990') || ' min'
        when 'weight_kg' then 'Weight average ' || to_char(round(avg(h.value), 1), 'FM990.0') || ' kg'
      end as line
    from public.health_samples h
    where h.user_id = target
      and h.kind = any(health_kinds)
      and h.recorded_on >= (timezone('Europe/London', now()))::date - 6
      and h.recorded_on <= (timezone('Europe/London', now()))::date
    group by h.kind
  ) headlines
  where line is not null;
  if shown_health <> '[]'::jsonb then
    shared_labels := shared_labels || 'Health headlines'::text;
  else
    hidden_labels := hidden_labels || 'Health headlines'::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'caption', p.caption,
    'takenOn', p.taken_on,
    'monthIndex', p.month_index
  ) order by p.month_index, p.taken_on), '[]'::jsonb) into shown_photos
  from public.progress_photos p
  where p.user_id = target and p.visibility = 'community';
  if shown_photos <> '[]'::jsonb then
    shared_labels := shared_labels || 'Progress photos'::text;
  else
    hidden_labels := hidden_labels || 'Progress photos'::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'body', g.body,
    'entryDate', g.entry_date
  ) order by g.entry_date), '[]'::jsonb) into shown_gratitude
  from public.gratitude_entries g
  where g.user_id = target and g.id = any(gratitude_ids);
  if shown_gratitude <> '[]'::jsonb then
    shared_labels := shared_labels || 'Gratitude lines'::text;
  else
    hidden_labels := hidden_labels || 'Gratitude lines'::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', gp.id, 'caption', gp.caption) order by gp.created_at), '[]'::jsonb) into shown_gratitude_photos
  from public.gratitude_photos gp
  where gp.user_id = target
    and gp.id = any(gratitude_photo_ids)
    and gp.entry_id = any(gratitude_ids);
  if shown_gratitude_photos <> '[]'::jsonb then
    shared_labels := shared_labels || 'Gratitude photos'::text;
  else
    hidden_labels := hidden_labels || 'Gratitude photos'::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'caption', v.caption,
    'area', v.area
  ) order by v.position), '[]'::jsonb) into shown_vision
  from public.vision_board_items v
  where v.user_id = target and v.id = any(vision_ids);
  if shown_vision <> '[]'::jsonb then
    shared_labels := shared_labels || 'Vision items'::text;
  else
    hidden_labels := hidden_labels || 'Vision items'::text;
  end if;

  if share_quote and person.pinned_quote_id is not null and person.pinned_quote_id ~ '^[a-z0-9-]{1,80}$' then
    shown_quote := person.pinned_quote_id;
    shared_labels := shared_labels || 'Pinned quote'::text;
  else
    hidden_labels := hidden_labels || 'Pinned quote'::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ph.id,
    'role', ph.role,
    'caption', ph.caption,
    'position', ph.position
  ) order by case when ph.role = 'avatar' then 0 else 1 end, ph.position, ph.created_at), '[]'::jsonb)
  into shown_profile_photos
  from public.profile_photos ph
  where ph.user_id = target;
  if shown_profile_photos <> '[]'::jsonb then
    shared_labels := shared_labels || 'Profile photos'::text;
  else
    hidden_labels := hidden_labels || 'Profile photos'::text;
  end if;

  return jsonb_build_object(
    'displayName', person.display_name,
    'bio', shown_bio,
    'interests', interest_labels,
    'town', shown_town,
    'stage', shown_stage,
    'sober', shown_sober,
    'milestones', shown_milestones,
    'reasons', shown_reasons,
    'moneySaved', shown_money,
    'unitsAvoided', shown_units,
    'moodStreak', shown_mood,
    'health', shown_health,
    'progressPhotos', shown_photos,
    'profilePhotos', shown_profile_photos,
    'gratitude', shown_gratitude,
    'gratitudePhotos', shown_gratitude_photos,
    'vision', shown_vision,
    'pinnedQuoteId', shown_quote,
    'sharedLabels', to_jsonb(shared_labels),
    'hiddenLabels', to_jsonb(hidden_labels)
  );
end;
$function$;

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
       and settings.goal in ('lose_weight', 'lose_fat_build_muscle')
       and (latest_kg / power(owner.height_cm / 100.0, 2)) < 18.5 then
      bmi_low := true;
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

CREATE OR REPLACE FUNCTION public.shared_profile_photos(photo_ids uuid[])
 RETURNS TABLE(id uuid, user_id uuid, role text, caption text, "position" integer, storage_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.user_id, p.role, p.caption, p.position, p.storage_path
  from public.profile_photos p
  join public.profiles owner on owner.id = p.user_id
  where auth.uid() is not null
    and (p.user_id = auth.uid() or public.viewer_in_community())
    and p.id = any(photo_ids)
    and owner.community_visible is true
    and owner.age_confirmed_18 is true
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.shared_progress_photos(photo_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, user_id uuid, taken_on date, month_index smallint, caption text, storage_path text, created_at timestamp with time zone, visibility text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.user_id, p.taken_on, p.month_index, p.caption, p.storage_path, p.created_at, p.visibility
  from public.progress_photos p
  join public.profiles owner on owner.id = p.user_id
  where auth.uid() is not null
    and (p.user_id = auth.uid() or public.viewer_in_community())
    and p.visibility = 'community'
    and (photo_ids is null or p.id = any(photo_ids))
    and owner.community_visible is true
    and owner.age_confirmed_18 is true
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    );
$function$;
