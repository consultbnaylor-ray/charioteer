-- Profile picture and gallery. Additive.
-- A profile photo is meant for the public profile. It is not a progress,
-- gratitude, or vision photo, and it has no private/community switch.
-- Other signed-in people cannot select the object. They receive a short
-- signed URL from profile-photo-url, which calls shared_profile_photos.
-- That function requires community consent, age 18, and no block either way.
-- The owner can read, write, and delete only their own folder.

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('avatar', 'gallery')),
  caption text not null default '' check (char_length(caption) <= 140),
  position integer not null default 0 check (position >= 0),
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint profile_photos_path_owner check (
    storage_path = user_id::text || '/' || id::text || '.jpg'
    and storage_path not like '%..%'
  )
);

create unique index profile_photos_one_avatar
  on public.profile_photos (user_id)
  where role = 'avatar';

create index profile_photos_user_idx on public.profile_photos (user_id, role, position);

alter table public.profile_photos enable row level security;

create policy profile_photos_own on public.profile_photos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.profile_photos from public, anon, authenticated;
grant select (id, user_id, role, caption, position, storage_path, created_at) on public.profile_photos to authenticated;
grant insert (id, user_id, role, caption, position, storage_path) on public.profile_photos to authenticated;
grant update (caption, position) on public.profile_photos to authenticated;
grant delete on public.profile_photos to authenticated;

create or replace function public.profile_photos_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role = 'gallery' and (
    select count(*)
    from public.profile_photos
    where user_id = new.user_id and role = 'gallery'
  ) >= 6 then
    raise exception 'Six profile photos is the limit.';
  end if;
  return new;
end;
$$;

revoke all on function public.profile_photos_limit() from public, anon, authenticated;

create trigger profile_photos_limit
  before insert on public.profile_photos
  for each row execute function public.profile_photos_limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_photos_storage_read on storage.objects;
create policy profile_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists profile_photos_storage_insert on storage.objects;
create policy profile_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists profile_photos_storage_delete on storage.objects;
create policy profile_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

create or replace function public.shared_profile_photos(photo_ids uuid[])
returns table (
  id uuid,
  user_id uuid,
  role text,
  caption text,
  "position" integer,
  storage_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.user_id, p.role, p.caption, p.position, p.storage_path
  from public.profile_photos p
  join public.profiles owner on owner.id = p.user_id
  where auth.uid() is not null
    and p.id = any(photo_ids)
    and owner.community_visible is true
    and owner.age_confirmed_18 is true
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    );
$$;

revoke all on function public.shared_profile_photos(uuid[]) from public, anon, authenticated;
grant execute on function public.shared_profile_photos(uuid[]) to authenticated;

alter table public.directory
  add column if not exists avatar_photo_id uuid;

create or replace function public.sync_directory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  share_town boolean := false;
  share_bio boolean := true;
begin
  select coalesce((settings->>'town')::boolean, false) into share_town
  from public.profile_sharing
  where user_id = new.id;
  if share_town is null then
    share_town := false;
  end if;
  select coalesce((settings->>'bio')::boolean, true) into share_bio
  from public.profile_sharing
  where user_id = new.id;
  if share_bio is null then
    share_bio := true;
  end if;
  insert into public.directory (user_id, display_name, town, bio, avatar_photo_id, visible, age_confirmed_18)
  values (
    new.id,
    new.display_name,
    case when share_town then new.town else null end,
    case when share_bio and nullif(btrim(new.bio), '') is not null then btrim(new.bio) else null end,
    (select ph.id from public.profile_photos ph where ph.user_id = new.id and ph.role = 'avatar' limit 1),
    new.community_visible,
    new.age_confirmed_18
  )
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        town = excluded.town,
        bio = excluded.bio,
        avatar_photo_id = excluded.avatar_photo_id,
        visible = excluded.visible,
        age_confirmed_18 = excluded.age_confirmed_18;
  return new;
end;
$$;

create or replace function public.sync_directory_town()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.directory d
  set town = case when coalesce((new.settings->>'town')::boolean, false) then p.town else null end,
      bio = case
        when coalesce((new.settings->>'bio')::boolean, true) and nullif(btrim(p.bio), '') is not null then btrim(p.bio)
        else null
      end
  from public.profiles p
  where p.id = new.user_id and d.user_id = new.user_id;
  return new;
end;
$$;

create or replace function public.sync_directory_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid := coalesce(new.user_id, old.user_id);
  avatar uuid;
begin
  select id into avatar
  from public.profile_photos
  where user_id = owner and role = 'avatar'
  limit 1;
  update public.directory
  set avatar_photo_id = avatar
  where user_id = owner;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_directory_avatar() from public, anon, authenticated;

drop trigger if exists profile_photos_sync_avatar on public.profile_photos;
create trigger profile_photos_sync_avatar
  after insert or update or delete on public.profile_photos
  for each row execute function public.sync_directory_avatar();

update public.directory d
set avatar_photo_id = (
  select ph.id from public.profile_photos ph
  where ph.user_id = d.user_id and ph.role = 'avatar'
  limit 1
);


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
  share_bio boolean := true;
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
  shown_bio text := null;
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

  select coalesce(s.settings, '{}'::jsonb) into settings
  from public.profile_sharing s
  where s.user_id = target;
  settings := coalesce(settings, '{}'::jsonb);
  share_town := coalesce((settings->>'town')::boolean, false);
  share_bio := coalesce((settings->>'bio')::boolean, true);
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

  if share_bio and nullif(btrim(person.bio), '') is not null then
    shown_bio := btrim(person.bio);
    shared_labels := shared_labels || 'Bio';
  else
    hidden_labels := hidden_labels || 'Bio';
  end if;

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
    'caption', p.caption,
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

  select coalesce(jsonb_agg(jsonb_build_object('id', gp.id, 'caption', gp.caption) order by gp.created_at), '[]'::jsonb) into shown_gratitude_photos
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
    shared_labels := shared_labels || 'Profile photos';
  else
    hidden_labels := hidden_labels || 'Profile photos';
  end if;

  return jsonb_build_object(
    'displayName', person.display_name,
    'bio', shown_bio,
    'interests', interest_labels,
    'town', shown_town,
    'stage', shown_stage,
    'sober', shown_sober,
    'reasons', shown_reasons,
    'savings', shown_savings,
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
    'profile_photos', (
      select coalesce(jsonb_agg(to_jsonb(ph) order by ph.role, ph.position, ph.created_at), '[]'::jsonb)
      from public.profile_photos ph
      where ph.user_id = uid
    ),
    'profile_sharing', (
      select coalesce(to_jsonb(s), 'null'::jsonb)
      from public.profile_sharing s
      where s.user_id = uid
    )
  );
end;
$$;
