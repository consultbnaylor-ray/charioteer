-- Shared health totals. Not applied from this repo. Ben reviews this file before it runs.
-- 20261022180000_garmin_connect.sql is already applied. This file adds no tables and no Apple workout upload.
-- One figure per shared box per day. If Garmin recorded any activity that day, the workout minutes are Garmin's alone.
-- Otherwise the Apple workout total already stored is used. The two are never added.
-- Resting heart rate uses a resting value only. A day with no resting value is left out. Average heart rate is not used.

create or replace function public.shared_health_days(target uuid)
returns table(kind text, recorded_on date, value numeric, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  settings jsonb := '{}'::jsonb;
  health_kinds text[] := array[]::text[];
  window_start date := (timezone('Europe/London', now()))::date - 6;
  window_end date := (timezone('Europe/London', now()))::date;
begin
  if uid is null or target is null then
    return;
  end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = uid and blocked_id = target)
       or (blocker_id = target and blocked_id = uid)
  ) then
    return;
  end if;
  if not exists (
    select 1 from public.profiles person
    where person.id = target
      and person.community_visible is true
      and person.age_confirmed_18 is true
  ) then
    return;
  end if;
  if uid is distinct from target and not public.viewer_in_community() then
    return;
  end if;

  select coalesce(s.settings, '{}'::jsonb) into settings
  from public.profile_sharing s
  where s.user_id = target;
  select coalesce(array_agg(listed.item), array[]::text[]) into health_kinds
  from jsonb_array_elements_text(coalesce(settings->'healthKinds', '[]'::jsonb)) as listed(item)
  where listed.item in ('steps', 'sleep_hours', 'resting_heart_rate', 'hrv_sdnn', 'workout_minutes', 'weight_kg');

  return query
  select s.kind, s.recorded_on, s.value, s.created_at
  from public.health_samples s
  where s.user_id = target
    and s.kind = any(health_kinds)
    and s.recorded_on between window_start and window_end
    and not (
      s.kind = 'resting_heart_rate'
      and exists (
        select 1 from public.garmin_dailies d
        where d.user_id = target
          and d.calendar_date = s.recorded_on
          and d.resting_heart_rate_bpm is not null
      )
    )
    and not (
      s.kind = 'sleep_hours'
      and exists (
        select 1 from public.garmin_sleep n
        where n.user_id = target
          and n.calendar_date = s.recorded_on
          and n.duration_seconds > 0
      )
    )
    and not (
      s.kind = 'workout_minutes'
      and exists (
        select 1 from public.garmin_activities a
        where a.user_id = target
          and a.duration_seconds > 0
          and (a.started_at at time zone 'Europe/London')::date = s.recorded_on
      )
    )
  union all
  select
    'resting_heart_rate'::text,
    d.calendar_date,
    round(d.resting_heart_rate_bpm::numeric),
    'infinity'::timestamptz
  from public.garmin_dailies d
  where 'resting_heart_rate' = any(health_kinds)
    and d.user_id = target
    and d.calendar_date between window_start and window_end
    and d.resting_heart_rate_bpm is not null
  union all
  select
    'sleep_hours'::text,
    n.calendar_date,
    max(round((n.duration_seconds / 3600.0)::numeric, 1)),
    'infinity'::timestamptz
  from public.garmin_sleep n
  where 'sleep_hours' = any(health_kinds)
    and n.user_id = target
    and n.calendar_date between window_start and window_end
    and n.duration_seconds > 0
  group by n.calendar_date
  union all
  select
    'workout_minutes'::text,
    (a.started_at at time zone 'Europe/London')::date,
    sum(greatest(1, round(a.duration_seconds::numeric / 60)))::numeric,
    'infinity'::timestamptz
  from public.garmin_activities a
  where 'workout_minutes' = any(health_kinds)
    and a.user_id = target
    and a.duration_seconds > 0
    and (a.started_at at time zone 'Europe/London')::date between window_start and window_end
  group by (a.started_at at time zone 'Europe/London')::date;
end;
$$;

revoke all on function public.shared_health_days(uuid) from public, anon, authenticated;

comment on function public.shared_health_days(uuid) is
  'Daily figures for health boxes that member has shared. Members cannot call this directly. No connection, token, or raw row is returned.';

create or replace function public.shared_health_preview()
returns table(kind text, recorded_on date, value numeric, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
  select days.kind, days.recorded_on, days.value, days.created_at
  from public.shared_health_days(auth.uid()) as days;
end;
$$;

revoke all on function public.shared_health_preview() from public, anon;
grant execute on function public.shared_health_preview() to authenticated;

comment on function public.shared_health_preview() is
  'The signed-in member previews only their own shared health days.';


CREATE OR REPLACE FUNCTION public.public_profile(user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 set search_path = public, pg_temp
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
  shown_trends jsonb := '[]'::jsonb;
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
      where check_ins.user_id = target
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
    from public.shared_health_days(target) h
    where h.kind = any(health_kinds)
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
    'kind', grouped.kind,
    'points', grouped.points
  ) order by grouped.kind), '[]'::jsonb) into shown_trends
  from (
    select dayrow.kind,
      jsonb_agg(jsonb_build_object(
        'day', to_char(dayrow.recorded_on, 'YYYY-MM-DD'),
        'value', round(dayrow.value, 1)
      ) order by dayrow.recorded_on) as points
    from (
      select distinct on (s.kind, s.recorded_on)
        s.kind, s.recorded_on, s.value
      from public.shared_health_days(target) s
      where s.kind = any(health_kinds)
        and s.recorded_on >= (timezone('Europe/London', now()))::date - 6
        and s.recorded_on <= (timezone('Europe/London', now()))::date
      order by s.kind, s.recorded_on, s.created_at desc
    ) dayrow
    group by dayrow.kind
  ) grouped;


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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gp.id,
    'entryId', gp.entry_id,
    'caption', gp.caption,
    'storagePath', gp.storage_path
  ) order by gp.created_at), '[]'::jsonb) into shown_gratitude_photos
  from public.gratitude_photos gp
  where gp.user_id = target
    and gp.id = any(gratitude_photo_ids)
    and gp.entry_id = any(gratitude_ids)
    and gp.storage_path = gp.user_id::text || '/' || gp.id::text || '.jpg'
    and gp.storage_path not like '%..%';
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
    'healthTrends', shown_trends,
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

revoke all on function public.public_profile(uuid) from public, anon;
grant execute on function public.public_profile(uuid) to authenticated;
