-- Saved Stoic lines and the quote pinned on a profile.
--
-- The catalogue lives in the app. quote_id is that catalogue id, not a row
-- in the database. user_quotes is the private favourites list. pinned_quote_id
-- is the line shown on You. Other people see it only when profile sharing
-- has pinnedQuote on, and then only as the id. The app fills in the words
-- from the catalogue, so an unknown id shows nothing.
--
-- Owner-only. Delete cascades with the profile. Export adds user_quotes.
-- The profile object already includes pinned_quote_id.

alter table public.profiles
  add column pinned_quote_id text
    check (pinned_quote_id is null or pinned_quote_id ~ '^[a-z0-9-]{1,80}$');

grant update (pinned_quote_id) on public.profiles to authenticated;

create table public.user_quotes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quote_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, quote_id),
  constraint user_quotes_id_shape check (quote_id ~ '^[a-z0-9-]{1,80}$')
);

alter table public.user_quotes enable row level security;

revoke all on public.user_quotes from public, anon, authenticated;
grant select, insert, delete on public.user_quotes to authenticated;

create policy user_quotes_select on public.user_quotes
  for select to authenticated
  using (user_id = auth.uid());

create policy user_quotes_insert on public.user_quotes
  for insert to authenticated
  with check (user_id = auth.uid());

create policy user_quotes_delete on public.user_quotes
  for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.public_profile(user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  target uuid := user_id;
  person public.profiles%rowtype;
  settings jsonb := '{}'::jsonb;
  share_town boolean := false;
  share_stage boolean := false;
  share_sober boolean := false;
  share_savings boolean := false;
  share_mood boolean := false;
  reason_bodies text[] := array[]::text[];
  health_kinds text[] := array[]::text[];
  gratitude_ids uuid[] := array[]::uuid[];
  gratitude_photo_ids uuid[] := array[]::uuid[];
  vision_ids uuid[] := array[]::uuid[];
  interest_labels jsonb := '[]'::jsonb;
  shown_town text := null;
  shown_stage text := null;
  shown_sober jsonb := null;
  shown_reasons jsonb := '[]'::jsonb;
  shown_savings jsonb := null;
  shown_mood int := null;
  shown_health jsonb := '[]'::jsonb;
  shown_photos jsonb := '[]'::jsonb;
  shown_gratitude jsonb := '[]'::jsonb;
  shown_gratitude_photos jsonb := '[]'::jsonb;
  shown_vision jsonb := '[]'::jsonb;
  share_quote boolean := false;
  shown_quote text := null;
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

  select coalesce(s.settings, '{}'::jsonb) into settings
  from public.profile_sharing s
  where s.user_id = target;
  settings := coalesce(settings, '{}'::jsonb);
  share_town := coalesce((settings->>'town')::boolean, false);
  share_stage := coalesce((settings->>'stage')::boolean, false);
  share_sober := coalesce((settings->>'sober')::boolean, false);
  share_savings := coalesce((settings->>'savings')::boolean, false);
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

  if share_town and nullif(btrim(person.town), '') is not null then
    shown_town := btrim(person.town);
    shared_labels := shared_labels || 'Town';
  else
    hidden_labels := hidden_labels || 'Town';
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
    shared_labels := shared_labels || 'Stage';
  else
    hidden_labels := hidden_labels || 'Stage';
  end if;

  if share_sober and person.sobriety_started_at is not null and person.sobriety_started_at <= now() then
    days := floor(extract(epoch from (now() - person.sobriety_started_at)) / 86400);
    shown_sober := jsonb_build_object(
      'days', days,
      'milestones', (
        select coalesce(jsonb_agg(badge order by ord), '[]'::jsonb)
        from (
          select 1 as ord, 'First day' as badge where now() >= person.sobriety_started_at + interval '24 hours'
          union all select 2, 'One week' where now() >= person.sobriety_started_at + interval '7 days'
          union all select 3, 'One month' where now() >= person.sobriety_started_at + interval '30 days'
          union all select 4, 'Ninety days' where now() >= person.sobriety_started_at + interval '90 days'
          union all select 5, 'Half year' where now() >= person.sobriety_started_at + interval '6 months'
          union all select 6, 'A year' where now() >= person.sobriety_started_at + interval '1 year'
        ) earned
      )
    );
    shared_labels := shared_labels || 'Days sober and milestones';
  else
    hidden_labels := hidden_labels || 'Days sober and milestones';
  end if;

  select coalesce(jsonb_agg(r.body order by r.sort_order), '[]'::jsonb) into shown_reasons
  from public.reasons r
  where r.user_id = target
    and btrim(r.body) = any(reason_bodies);
  if shown_reasons <> '[]'::jsonb then
    shared_labels := shared_labels || 'Reasons';
  else
    hidden_labels := hidden_labels || 'Reasons';
  end if;

  if share_savings and person.sobriety_started_at is not null and person.weekly_spend_gbp is not null and person.weekly_units is not null then
    weeks := greatest(extract(epoch from (now() - person.sobriety_started_at)), 0) / (7 * 86400);
    shown_savings := jsonb_build_object(
      'moneyGbp', round(person.weekly_spend_gbp * weeks, 2),
      'units', round(person.weekly_units * weeks, 1)
    );
    shared_labels := shared_labels || 'Money saved and units avoided';
  else
    hidden_labels := hidden_labels || 'Money saved and units avoided';
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
    shared_labels := shared_labels || 'Mood streak';
  else
    hidden_labels := hidden_labels || 'Mood streak';
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
    shared_labels := shared_labels || 'Health headlines';
  else
    hidden_labels := hidden_labels || 'Health headlines';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'note', p.note,
    'takenOn', p.taken_on,
    'monthIndex', p.month_index
  ) order by p.month_index, p.taken_on), '[]'::jsonb) into shown_photos
  from public.progress_photos p
  where p.user_id = target and p.visibility = 'community';
  if shown_photos <> '[]'::jsonb then
    shared_labels := shared_labels || 'Progress photos';
  else
    hidden_labels := hidden_labels || 'Progress photos';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'body', g.body,
    'entryDate', g.entry_date
  ) order by g.entry_date), '[]'::jsonb) into shown_gratitude
  from public.gratitude_entries g
  where g.user_id = target and g.id = any(gratitude_ids);
  if shown_gratitude <> '[]'::jsonb then
    shared_labels := shared_labels || 'Gratitude lines';
  else
    hidden_labels := hidden_labels || 'Gratitude lines';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', gp.id) order by gp.created_at), '[]'::jsonb) into shown_gratitude_photos
  from public.gratitude_photos gp
  where gp.user_id = target and gp.id = any(gratitude_photo_ids);
  if shown_gratitude_photos <> '[]'::jsonb then
    shared_labels := shared_labels || 'Gratitude photos';
  else
    hidden_labels := hidden_labels || 'Gratitude photos';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'caption', v.caption,
    'area', v.area
  ) order by v.position), '[]'::jsonb) into shown_vision
  from public.vision_board_items v
  where v.user_id = target and v.id = any(vision_ids);
  if shown_vision <> '[]'::jsonb then
    shared_labels := shared_labels || 'Vision items';
  else
    hidden_labels := hidden_labels || 'Vision items';
  end if;

  if share_quote and person.pinned_quote_id is not null and person.pinned_quote_id ~ '^[a-z0-9-]{1,80}$' then
    shown_quote := person.pinned_quote_id;
    shared_labels := shared_labels || 'Pinned quote';
  else
    hidden_labels := hidden_labels || 'Pinned quote';
  end if;

  return jsonb_build_object(
    'displayName', person.display_name,
    'interests', interest_labels,
    'town', shown_town,
    'stage', shown_stage,
    'sober', shown_sober,
    'reasons', shown_reasons,
    'savings', shown_savings,
    'moodStreak', shown_mood,
    'health', shown_health,
    'progressPhotos', shown_photos,
    'gratitude', shown_gratitude,
    'gratitudePhotos', shown_gratitude_photos,
    'vision', shown_vision,
    'pinnedQuoteId', shown_quote,
    'sharedLabels', to_jsonb(shared_labels),
    'hiddenLabels', to_jsonb(hidden_labels)
  );
end;
$$;

revoke all on function public.public_profile(uuid) from public, anon;
grant execute on function public.public_profile(uuid) to authenticated;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'reasons', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order), '[]'::jsonb) from public.reasons r where r.user_id = uid),
    'check_ins', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.check_ins c where c.user_id = uid),
    'relapses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.relapses r where r.user_id = uid),
    'health_samples', (select coalesce(jsonb_agg(to_jsonb(h) order by h.recorded_on), '[]'::jsonb) from public.health_samples h where h.user_id = uid),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.consents c where c.user_id = uid),
    'thumos_messages', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) from public.thumos_messages m where m.user_id = uid),
    'interests', (
      select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.user_id = uid
    ),
    'connections', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.connections c
      where uid in (c.requester_id, c.addressee_id)
    ),
    'messages', (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
      from public.direct_messages m
      join public.connections c on c.id = m.connection_id
      where uid in (c.requester_id, c.addressee_id)
    ),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.reports r where r.reporter_id = uid),
    'progress_photos', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.month_index, p.taken_on), '[]'::jsonb)
      from public.progress_photos p
      where p.user_id = uid
    ),
    'gratitude_entries', (
      select coalesce(jsonb_agg(to_jsonb(g) order by g.entry_date, g.created_at), '[]'::jsonb)
      from public.gratitude_entries g
      where g.user_id = uid
    ),
    'gratitude_photos', (
      select coalesce(jsonb_agg(to_jsonb(gp) order by gp.created_at), '[]'::jsonb)
      from public.gratitude_photos gp
      where gp.user_id = uid
    ),
    'vision_board_items', (
      select coalesce(jsonb_agg(to_jsonb(v) order by v.position, v.created_at), '[]'::jsonb)
      from public.vision_board_items v
      where v.user_id = uid
    ),
    'user_quotes', (
      select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
      from public.user_quotes q
      where q.user_id = uid
    ),
    'profile_sharing', (
      select coalesce(to_jsonb(s), 'null'::jsonb)
      from public.profile_sharing s
      where s.user_id = uid
    )
  );
end;
$$;
