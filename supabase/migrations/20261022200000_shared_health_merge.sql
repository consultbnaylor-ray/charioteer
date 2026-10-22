-- Shared health totals. Not applied from this repo. Ben reviews this file before it runs.
-- Apply 20261022180000_garmin_connect.sql first. The Garmin tables stay closed to other members.
-- A shared box returns the same daily figure the owner sees: Garmin replaces that day, and the two sources are not added.
-- Apple workout intervals are the owner's start and length only. No path is stored. Other members never read that table.

create table public.apple_workout_spans (
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_id text not null,
  started_at timestamptz not null,
  duration_minutes integer not null,
  primary key (user_id, workout_id),
  check (workout_id ~ '^[A-Za-z0-9-]{1,80}$'),
  check (duration_minutes between 1 and 1440)
);

alter table public.apple_workout_spans enable row level security;

create policy apple_workout_spans_own on public.apple_workout_spans
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.apple_workout_spans from public, anon, authenticated;
grant select, insert, delete on table public.apple_workout_spans to authenticated;

comment on table public.apple_workout_spans is
  'Owner Apple workout start and length, so a shared workout total can count one session once. No path is stored.';

create or replace function public.shared_workout_same_session(
  a_start timestamptz,
  a_ms bigint,
  b_start timestamptz,
  b_ms bigint
) returns boolean
language sql
immutable
as $$
  select
    a_ms > 0
    and b_ms > 0
    and a_start is not null
    and b_start is not null
    and (
      (
        least(
          a_start + (a_ms * interval '1 millisecond'),
          b_start + (b_ms * interval '1 millisecond')
        ) - greatest(a_start, b_start)
      ) >= ((least(a_ms, b_ms)::numeric * 0.5) * interval '1 millisecond')
      or (
        abs(extract(epoch from (a_start - b_start))) * 1000 <= 120000
        and (
          least(a_ms, b_ms) >= greatest(a_ms, b_ms)::numeric * 0.8
          or abs(a_ms - b_ms) <= 120000
        )
      )
    );
$$;

revoke all on function public.shared_workout_same_session(timestamptz, bigint, timestamptz, bigint) from public, anon, authenticated;

create or replace function public.shared_health_days(target uuid)
returns table(kind text, recorded_on date, value numeric, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  settings jsonb := '{}'::jsonb;
  health_kinds text[] := array[]::text[];
  window_start date := (timezone('Europe/London', now()))::date - 6;
  window_end date := (timezone('Europe/London', now()))::date;
  span_count int := 0;
  garmin jsonb := '[]'::jsonb;
  apple jsonb := '[]'::jsonb;
  merged jsonb := '[]'::jsonb;
  used boolean[] := array[]::boolean[];
  replaced jsonb := '[]'::jsonb;
  workout_rows jsonb := '[]'::jsonb;
  item jsonb;
  kept jsonb;
  other jsonb;
  primary_row jsonb;
  day_totals jsonb := '{}'::jsonb;
  current jsonb;
  day text;
  i int;
  j int;
  best int;
  best_score numeric;
  score numeric;
  overlap_ms numeric;
  shorter numeric;
  g_start timestamptz;
  a_start timestamptz;
  g_ms bigint;
  a_ms bigint;
  rec record;
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

  if 'resting_heart_rate' = any(health_kinds) then
    for rec in
      select d.calendar_date, round(coalesce(d.resting_heart_rate_bpm, d.average_heart_rate_bpm)::numeric) as bpm
      from public.garmin_dailies d
      where d.user_id = target
        and d.calendar_date between window_start and window_end
        and coalesce(d.resting_heart_rate_bpm, d.average_heart_rate_bpm) is not null
    loop
      replaced := replaced || jsonb_build_array(jsonb_build_object('kind', 'resting_heart_rate', 'day', rec.calendar_date));
      workout_rows := workout_rows || jsonb_build_array(jsonb_build_object(
        'kind', 'resting_heart_rate',
        'recorded_on', rec.calendar_date,
        'value', rec.bpm,
        'created_at', 'infinity'
      ));
    end loop;
  end if;

  if 'sleep_hours' = any(health_kinds) then
    for rec in
      select n.calendar_date, max(round((n.duration_seconds / 3600.0)::numeric, 1)) as hours
      from public.garmin_sleep n
      where n.user_id = target
        and n.calendar_date between window_start and window_end
        and n.duration_seconds > 0
      group by n.calendar_date
    loop
      replaced := replaced || jsonb_build_array(jsonb_build_object('kind', 'sleep_hours', 'day', rec.calendar_date));
      workout_rows := workout_rows || jsonb_build_array(jsonb_build_object(
        'kind', 'sleep_hours',
        'recorded_on', rec.calendar_date,
        'value', rec.hours,
        'created_at', 'infinity'
      ));
    end loop;
  end if;

  if 'workout_minutes' = any(health_kinds) then
    select count(*) into span_count from public.apple_workout_spans where user_id = target;

    for rec in
      select
        a.started_at,
        a.duration_seconds * 1000 as duration_ms,
        greatest(1, round(a.duration_seconds::numeric / 60)::int) as duration_minutes,
        (
          (case when a.training_effect is not null then 2 else 0 end)
          + (case when a.average_heart_rate_bpm is not null then 1 else 0 end)
          + (case when a.anaerobic_effect is not null then 1 else 0 end)
          + a.duration_seconds
        )::numeric as richness
      from public.garmin_activities a
      where a.user_id = target
        and a.duration_seconds > 0
        and (a.started_at at time zone 'Europe/London')::date between window_start and window_end
      order by a.started_at, a.summary_id
    loop
      item := jsonb_build_object(
        'start', rec.started_at,
        'ms', rec.duration_ms,
        'minutes', rec.duration_minutes,
        'rich', rec.richness,
        'origin', 'garmin'
      );
      j := -1;
      for i in 0 .. jsonb_array_length(garmin) - 1 loop
        kept := garmin->i;
        if public.shared_workout_same_session(
          (item->>'start')::timestamptz,
          (item->>'ms')::bigint,
          (kept->>'start')::timestamptz,
          (kept->>'ms')::bigint
        ) then
          if (kept->>'rich')::numeric >= (item->>'rich')::numeric then
            primary_row := kept;
            other := item;
          else
            primary_row := item;
            other := kept;
          end if;
          garmin := jsonb_set(garmin, array[i::text], jsonb_build_object(
            'start', primary_row->>'start',
            'ms', greatest((primary_row->>'ms')::bigint, (other->>'ms')::bigint),
            'minutes', greatest((primary_row->>'minutes')::int, (other->>'minutes')::int),
            'rich', greatest((primary_row->>'rich')::numeric, (other->>'rich')::numeric),
            'origin', 'garmin'
          ));
          j := i;
          exit;
        end if;
      end loop;
      if j < 0 then
        garmin := garmin || jsonb_build_array(item);
      end if;
    end loop;

    if span_count > 0 then
      for rec in
        select s.started_at, s.duration_minutes
        from public.apple_workout_spans s
        where s.user_id = target
          and (s.started_at at time zone 'Europe/London')::date between window_start and window_end
        order by s.started_at, s.workout_id
      loop
        apple := apple || jsonb_build_array(jsonb_build_object(
          'start', rec.started_at,
          'ms', rec.duration_minutes::bigint * 60 * 1000,
          'minutes', rec.duration_minutes,
          'origin', 'apple'
        ));
      end loop;
      if jsonb_array_length(apple) > 0 then
        used := array_fill(false, array[jsonb_array_length(apple)]);
      end if;

      for i in 0 .. jsonb_array_length(garmin) - 1 loop
        item := garmin->i;
        g_start := (item->>'start')::timestamptz;
        g_ms := (item->>'ms')::bigint;
        best := -1;
        best_score := 0;
        for j in 0 .. jsonb_array_length(apple) - 1 loop
          if used[j + 1] then
            continue;
          end if;
          kept := apple->j;
          a_start := (kept->>'start')::timestamptz;
          a_ms := (kept->>'ms')::bigint;
          if not public.shared_workout_same_session(g_start, g_ms, a_start, a_ms) then
            continue;
          end if;
          shorter := least(g_ms, a_ms);
          overlap_ms := extract(epoch from (
            least(
              g_start + (g_ms * interval '1 millisecond'),
              a_start + (a_ms * interval '1 millisecond')
            ) - greatest(g_start, a_start)
          )) * 1000;
          if overlap_ms > 0 and shorter > 0 then
            score := overlap_ms / shorter;
          else
            score := 0.5;
          end if;
          if score > best_score then
            best_score := score;
            best := j;
          end if;
        end loop;
        if best >= 0 then
          used[best + 1] := true;
        end if;
        merged := merged || jsonb_build_array(jsonb_build_object(
          'start', item->>'start',
          'minutes', (item->>'minutes')::int,
          'origin', 'garmin'
        ));
      end loop;

      for j in 0 .. jsonb_array_length(apple) - 1 loop
        if used[j + 1] then
          continue;
        end if;
        kept := apple->j;
        merged := merged || jsonb_build_array(jsonb_build_object(
          'start', kept->>'start',
          'minutes', (kept->>'minutes')::int,
          'origin', 'apple'
        ));
      end loop;

      for i in 0 .. jsonb_array_length(merged) - 1 loop
        item := merged->i;
        day := to_char((item->>'start')::timestamptz at time zone 'Europe/London', 'YYYY-MM-DD');
        current := coalesce(day_totals->day, '{}'::jsonb);
        day_totals := jsonb_set(
          day_totals,
          array[day],
          jsonb_build_object(
            'minutes', coalesce((current->>'minutes')::int, 0) + (item->>'minutes')::int,
            'garmin', coalesce((current->>'garmin')::boolean, false) or (item->>'origin') = 'garmin'
          ),
          true
        );
      end loop;

      for day in select jsonb_object_keys(day_totals) loop
        current := day_totals->day;
        if coalesce((current->>'garmin')::boolean, false) then
          replaced := replaced || jsonb_build_array(jsonb_build_object('kind', 'workout_minutes', 'day', day));
          workout_rows := workout_rows || jsonb_build_array(jsonb_build_object(
            'kind', 'workout_minutes',
            'recorded_on', day,
            'value', (current->>'minutes')::int,
            'created_at', 'infinity'
          ));
        end if;
      end loop;
    else
      for i in 0 .. jsonb_array_length(garmin) - 1 loop
        item := garmin->i;
        day := to_char((item->>'start')::timestamptz at time zone 'Europe/London', 'YYYY-MM-DD');
        current := coalesce(day_totals->day, '{}'::jsonb);
        day_totals := jsonb_set(
          day_totals,
          array[day],
          jsonb_build_object('minutes', coalesce((current->>'minutes')::int, 0) + (item->>'minutes')::int),
          true
        );
      end loop;
      for day in select jsonb_object_keys(day_totals) loop
        if exists (
          select 1 from public.health_samples s
          where s.user_id = target
            and s.kind = 'workout_minutes'
            and s.recorded_on = day::date
        ) then
          continue;
        end if;
        workout_rows := workout_rows || jsonb_build_array(jsonb_build_object(
          'kind', 'workout_minutes',
          'recorded_on', day,
          'value', ((day_totals->day)->>'minutes')::int,
          'created_at', 'infinity'
        ));
      end loop;
    end if;
  end if;

  return query
  select s.kind, s.recorded_on, s.value, s.created_at
  from public.health_samples s
  where s.user_id = target
    and s.kind = any(health_kinds)
    and s.recorded_on between window_start and window_end
    and not exists (
      select 1
      from jsonb_to_recordset(replaced) as d(kind text, day date)
      where d.kind = s.kind and d.day = s.recorded_on
    )
  union all
  select r.kind, r.recorded_on, r.value, r.created_at
  from jsonb_to_recordset(workout_rows) as r(kind text, recorded_on date, value numeric, created_at timestamptz);
end;
$$;

revoke all on function public.shared_health_days(uuid) from public, anon;
grant execute on function public.shared_health_days(uuid) to authenticated;

comment on function public.shared_health_days(uuid) is
  'Daily figures for health boxes that member has shared. Garmin replaces that day. No connection, token, or raw row is returned.';


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
