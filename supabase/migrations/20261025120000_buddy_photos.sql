-- Buddy photos. Not applied to the live project.
-- A photo sent from People, Buddies. Accepted buddies only. Never the Community.
-- Apply only after review. The app calls these functions. Until this file is applied, the screen says the table is not applied.
--
-- Files live in the private bucket buddy-photos at {owner_id}/{photo_id}.jpg.
-- The bucket is not public. A signed link is minted by the app for about 15 minutes.
-- Account deletion removes the buddy-photos folder before the auth user.
-- export_my_data below includes photos this person sent, photos shared with them
-- (without the other recipients), and the recipient list for photos they sent.
-- Not applied.

create table public.buddy_photos (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 140),
  storage_path text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  allow_save boolean not null default true,
  constraint buddy_photos_path_owner check (storage_path = owner_id::text || '/' || id::text || '.jpg')
);

create index buddy_photos_owner_created on public.buddy_photos (owner_id, created_at desc);

create table public.buddy_photo_recipients (
  photo_id uuid not null references public.buddy_photos (id) on delete cascade,
  buddy_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz,
  primary key (photo_id, buddy_id)
);

create or replace function public.buddy_photo_recipient_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.buddy_photos where id = new.photo_id;
  if owner is null or owner = new.buddy_id then
    raise exception 'Choose a buddy.';
  end if;
  return new;
end;
$$;

revoke all on function public.buddy_photo_recipient_guard() from public, anon, authenticated;

create trigger buddy_photo_recipient_guard
  before insert on public.buddy_photo_recipients
  for each row execute function public.buddy_photo_recipient_guard();

create index buddy_photo_recipients_buddy on public.buddy_photo_recipients (buddy_id);

alter table public.buddy_photos enable row level security;
alter table public.buddy_photo_recipients enable row level security;

revoke all on table public.buddy_photos from public, anon, authenticated;
revoke all on table public.buddy_photo_recipients from public, anon, authenticated;

comment on table public.buddy_photos is
  'A photo the owner sent to chosen accepted buddies. Not the Community. No client table grant. Functions are the only path.';

comment on column public.buddy_photos.allow_save is
  'When false, a buddy is not offered Save to Photos. Screenshots are still possible. Default true.';

alter table public.reports add column if not exists buddy_photo_id uuid;

comment on column public.reports.buddy_photo_id is
  'Set only by report_buddy_photo. The photo row may be deleted later. The report stays.';

create or replace function public.reports_buddy_photo_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.buddy_photo_id is not null
     and current_setting('buddy_photo.report', true) is distinct from '1' then
    raise exception 'Use the report action.';
  end if;
  return new;
end;
$$;

revoke all on function public.reports_buddy_photo_guard() from public, anon, authenticated;

drop trigger if exists reports_buddy_photo_guard on public.reports;
create trigger reports_buddy_photo_guard
  before insert on public.reports
  for each row execute function public.reports_buddy_photo_guard();

-- One accepted connection between the two people. The row is mutual once accepted.
create or replace function public.accepted_buddy_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null
    and b is not null
    and a <> b
    and exists (
      select 1
      from public.connections c
      where c.status = 'accepted'
        and (
          (c.requester_id = a and c.addressee_id = b)
          or (c.requester_id = b and c.addressee_id = a)
        )
    );
$$;

revoke all on function public.accepted_buddy_pair(uuid, uuid) from public, anon, authenticated;

create or replace function public.buddy_photo_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.buddy_photos p
    left join public.buddy_photo_recipients r
      on r.photo_id = p.id
     and r.buddy_id = auth.uid()
    where p.id = target
      and p.published_at is not null
      and auth.uid() is not null
      and public.buddy_is_adult(auth.uid())
      and public.buddy_is_adult(p.owner_id)
      and not public.buddy_pair_blocked(auth.uid(), p.owner_id)
      and (
        p.owner_id = auth.uid()
        or (
          r.buddy_id = auth.uid()
          and r.hidden_at is null
          and public.accepted_buddy_pair(p.owner_id, auth.uid())
        )
      )
  );
$$;

revoke all on function public.buddy_photo_visible(uuid) from public, anon, authenticated;

create or replace function public.can_read_buddy_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.buddy_photos p
    where p.storage_path = object_name
      and public.buddy_photo_visible(p.id)
  );
$$;

revoke all on function public.can_read_buddy_photo(text) from public, anon, authenticated;
grant execute on function public.can_read_buddy_photo(text) to authenticated;

create or replace function public.create_buddy_photo(photo uuid, caption text, recipients uuid[], allow_save boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text;
  chosen uuid;
  kept uuid[] := '{}';
  recent_day integer;
  recent_burst integer;
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;
  if photo is null then
    raise exception 'Choose a photo first.';
  end if;
  if not public.buddy_is_adult(uid) then
    raise exception 'Confirm you are 18 or over first.';
  end if;
  clean := btrim(coalesce(caption, ''));
  if char_length(clean) > 140 then
    raise exception 'Keep the caption to 140 characters.';
  end if;
  if exists (select 1 from public.buddy_photos where id = photo) then
    raise exception 'Choose a photo first.';
  end if;
  select count(*) into recent_day
  from public.buddy_photos
  where owner_id = uid
    and created_at > now() - interval '1 day';
  if recent_day >= 20 then
    raise exception 'Too many photos today.';
  end if;
  select count(*) into recent_burst
  from public.buddy_photos
  where owner_id = uid
    and created_at > now() - interval '10 minutes';
  if recent_burst >= 6 then
    raise exception 'Too many photos in a short time.';
  end if;
  if recipients is null or cardinality(recipients) = 0 then
    raise exception 'Choose a buddy.';
  end if;
  if cardinality(recipients) > 30 then
    raise exception 'Choose fewer buddies.';
  end if;

  foreach chosen in array recipients loop
    if chosen is null or chosen = uid then
      continue;
    end if;
    if chosen = any(kept) then
      continue;
    end if;
    if not public.buddy_is_adult(chosen) then
      continue;
    end if;
    if public.buddy_pair_blocked(uid, chosen) then
      continue;
    end if;
    if not public.accepted_buddy_pair(uid, chosen) then
      continue;
    end if;
    kept := kept || chosen;
  end loop;

  if cardinality(kept) = 0 then
    raise exception 'Choose a buddy who is still connected.';
  end if;

  insert into public.buddy_photos (id, owner_id, caption, storage_path, allow_save)
  values (photo, uid, clean, uid::text || '/' || photo::text || '.jpg', coalesce(allow_save, true));

  insert into public.buddy_photo_recipients (photo_id, buddy_id)
  select photo, buddy_id
  from unnest(kept) as buddy_id;

  return jsonb_build_object('id', photo, 'recipients', to_jsonb(kept));
end;
$$;

revoke all on function public.create_buddy_photo(uuid, text, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.create_buddy_photo(uuid, text, uuid[], boolean) to authenticated;

create or replace function public.publish_buddy_photo(photo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  path text;
begin
  if uid is null or photo is null then
    raise exception 'Choose a photo first.';
  end if;
  select storage_path into path
  from public.buddy_photos
  where id = photo
    and owner_id = uid
    and published_at is null;
  if path is null then
    raise exception 'Choose a photo first.';
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'buddy-photos'
      and name = path
  ) then
    raise exception 'The photo did not upload.';
  end if;
  update public.buddy_photos
  set published_at = now()
  where id = photo
    and owner_id = uid
    and published_at is null;
end;
$$;

revoke all on function public.publish_buddy_photo(uuid) from public, anon, authenticated;
grant execute on function public.publish_buddy_photo(uuid) to authenticated;

create or replace function public.delete_buddy_photo(photo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed integer;
begin
  if uid is null or photo is null then
    raise exception 'Choose a photo first.';
  end if;
  delete from public.buddy_photos
  where id = photo
    and owner_id = uid;
  get diagnostics removed = row_count;
  if removed = 0 then
    raise exception 'Choose a photo first.';
  end if;
end;
$$;

revoke all on function public.delete_buddy_photo(uuid) from public, anon, authenticated;
grant execute on function public.delete_buddy_photo(uuid) to authenticated;

create or replace function public.hide_buddy_photo(photo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed integer;
begin
  if uid is null or photo is null then
    raise exception 'That photo is not available.';
  end if;
  update public.buddy_photo_recipients
  set hidden_at = now()
  where photo_id = photo
    and buddy_id = uid
    and hidden_at is null;
  get diagnostics removed = row_count;
  if removed = 0 then
    raise exception 'That photo is not available.';
  end if;
end;
$$;

revoke all on function public.hide_buddy_photo(uuid) from public, anon, authenticated;
grant execute on function public.hide_buddy_photo(uuid) to authenticated;

create or replace function public.report_buddy_photo(photo uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  owner_name text;
  written text := left(btrim(coalesce(reason, '')), 80);
begin
  if uid is null or photo is null then
    raise exception 'That photo is not available.';
  end if;
  if char_length(written) < 1 then
    raise exception 'Add a reason.';
  end if;
  select p.owner_id, coalesce(nullif(btrim(pr.display_name), ''), 'Someone')
    into owner, owner_name
  from public.buddy_photos p
  join public.profiles pr on pr.id = p.owner_id
  join public.buddy_photo_recipients r on r.photo_id = p.id and r.buddy_id = uid
  where p.id = photo
    and p.published_at is not null
    and public.buddy_is_adult(uid)
    and public.buddy_is_adult(p.owner_id)
    and not public.buddy_pair_blocked(uid, p.owner_id)
    and public.accepted_buddy_pair(p.owner_id, uid);
  if owner is null then
    raise exception 'That photo is not available.';
  end if;
  perform set_config('buddy_photo.report', '1', true);
  insert into public.reports (reporter_id, reported_user_id, reported_name, reason, buddy_photo_id)
  values (uid, owner, owner_name, written, photo);
end;
$$;

revoke all on function public.report_buddy_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.report_buddy_photo(uuid, text) to authenticated;

create or replace function public.buddy_photo_feed()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.buddy_is_adult(uid) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(item order by item ->> 'createdAt' desc)
    from (
      select jsonb_build_object(
        'id', p.id,
        'ownerId', p.owner_id,
        'caption', p.caption,
        'storagePath', p.storage_path,
        'createdAt', p.created_at,
        'allowSave', p.allow_save,
        'published', p.published_at is not null,
        'mine', p.owner_id = uid,
        'recipients', case
          when p.owner_id = uid then (
            select coalesce(jsonb_agg(r.buddy_id), '[]'::jsonb)
            from public.buddy_photo_recipients r
            where r.photo_id = p.id
          )
          else '[]'::jsonb
        end
      ) as item
      from public.buddy_photos p
      left join public.buddy_photo_recipients r
        on r.photo_id = p.id
       and r.buddy_id = uid
      where not public.buddy_pair_blocked(uid, p.owner_id)
        and public.buddy_is_adult(p.owner_id)
        and (
          (p.owner_id = uid)
          or (
            p.published_at is not null
            and r.buddy_id = uid
            and r.hidden_at is null
            and public.accepted_buddy_pair(p.owner_id, uid)
          )
        )
    ) rows
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.buddy_photo_feed() from public, anon, authenticated;
grant execute on function public.buddy_photo_feed() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('buddy-photos', 'buddy-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists buddy_photos_storage_read on storage.objects;
create policy buddy_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'buddy-photos'
    and name not like '%..%'
    and public.can_read_buddy_photo(name)
  );

drop policy if exists buddy_photos_storage_insert on storage.objects;
create policy buddy_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'buddy-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
    and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );

drop policy if exists buddy_photos_storage_delete on storage.objects;
create policy buddy_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'buddy-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );


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
    ),
    'food_logs', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.eaten_on, f.created_at), '[]'::jsonb)
      from public.food_logs f
      where f.user_id = uid
    ),
    'nutrition_settings', (
      select coalesce(to_jsonb(n), 'null'::jsonb)
      from public.nutrition_settings n
      where n.user_id = uid
    ),
    'nutrition_days', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]'::jsonb)
      from public.nutrition_days d
      where d.user_id = uid
    ),
    'body_composition', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.recorded_on, b.created_at), '[]'::jsonb)
      from public.body_composition b
      where b.user_id = uid
    ),
    'health_plans', (
      select coalesce(to_jsonb(hp), 'null'::jsonb)
      from public.health_plans hp
      where hp.user_id = uid
    ),
    'training_schedules', (
      select coalesce(to_jsonb(ts), 'null'::jsonb)
      from public.training_schedules ts
      where ts.user_id = uid
    ),
    'garmin_connection', (
      select coalesce(jsonb_build_object(
        'garmin_user_id', g.garmin_user_id,
        'scopes', g.scopes,
        'permissions', g.permissions,
        'connected_at', g.connected_at,
        'revoked_at', g.revoked_at
      ), 'null'::jsonb)
      from public.garmin_connections g
      where g.user_id = uid
    ),
    'garmin_dailies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'calendar_date', d.calendar_date,
        'resting_heart_rate_bpm', d.resting_heart_rate_bpm,
        'average_heart_rate_bpm', d.average_heart_rate_bpm,
        'moderate_minutes', d.moderate_minutes,
        'vigorous_minutes', d.vigorous_minutes,
        'active_kilocalories', d.active_kilocalories,
        'steps', d.steps,
        'distance_metres', d.distance_metres,
        'floors_climbed', d.floors_climbed,
        'min_heart_rate_bpm', d.min_heart_rate_bpm,
        'max_heart_rate_bpm', d.max_heart_rate_bpm,
        'average_stress_level', d.average_stress_level,
        'body_battery_charged', d.body_battery_charged,
        'body_battery_drained', d.body_battery_drained,
        'body_battery_highest', d.body_battery_highest,
        'body_battery_lowest', d.body_battery_lowest,
        'step_goal', d.step_goal,
        'duration_seconds', d.duration_seconds
      ) order by d.calendar_date), '[]'::jsonb)
      from public.garmin_dailies d
      where d.user_id = uid
    ),
    'garmin_activities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', a.summary_id,
        'activity_type', a.activity_type,
        'activity_name', a.activity_name,
        'started_at', a.started_at,
        'duration_seconds', a.duration_seconds,
        'average_heart_rate_bpm', a.average_heart_rate_bpm,
        'training_effect', a.training_effect,
        'anaerobic_effect', a.anaerobic_effect
      ) order by a.started_at), '[]'::jsonb)
      from public.garmin_activities a
      where a.user_id = uid
    ),
    'garmin_sleep', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', s.summary_id,
        'calendar_date', s.calendar_date,
        'duration_seconds', s.duration_seconds,
        'deep_seconds', s.deep_seconds,
        'light_seconds', s.light_seconds,
        'rem_seconds', s.rem_seconds,
        'awake_seconds', s.awake_seconds,
        'sleep_score', s.sleep_score
      ) order by s.calendar_date), '[]'::jsonb)
      from public.garmin_sleep s
      where s.user_id = uid
    ),
    'garmin_user_metrics', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', m.summary_id,
        'calendar_date', m.calendar_date,
        'vo2_max', m.vo2_max,
        'vo2_max_cycling', m.vo2_max_cycling,
        'fitness_age', m.fitness_age
      ) order by m.calendar_date), '[]'::jsonb)
      from public.garmin_user_metrics m
      where m.user_id = uid
    ),
    'garmin_respiration', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', r.summary_id,
        'calendar_date', r.calendar_date,
        'average_breaths_per_minute', r.average_breaths_per_minute,
        'highest_breaths_per_minute', r.highest_breaths_per_minute,
        'lowest_breaths_per_minute', r.lowest_breaths_per_minute
      ) order by r.calendar_date), '[]'::jsonb)
      from public.garmin_respiration r
      where r.user_id = uid
    ),
    'garmin_pulse_ox', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', p.summary_id,
        'calendar_date', p.calendar_date,
        'average_spo2', p.average_spo2,
        'lowest_spo2', p.lowest_spo2,
        'highest_spo2', p.highest_spo2
      ) order by p.calendar_date), '[]'::jsonb)
      from public.garmin_pulse_ox p
      where p.user_id = uid
    ),
    'buddy_photos', (
      select coalesce(jsonb_agg(to_jsonb(bp) order by bp.created_at), '[]'::jsonb)
      from public.buddy_photos bp
      where bp.owner_id = uid
    ),
    'buddy_photos_shared_with_me', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'owner_id', bp.owner_id,
        'caption', bp.caption,
        'storage_path', bp.storage_path,
        'allow_save', bp.allow_save,
        'created_at', bp.created_at,
        'published_at', bp.published_at
      ) order by bp.created_at), '[]'::jsonb)
      from public.buddy_photos bp
      join public.buddy_photo_recipients br on br.photo_id = bp.id
      where br.buddy_id = uid
        and br.hidden_at is null
        and bp.published_at is not null
    ),
    'buddy_photo_recipients', (
      select coalesce(jsonb_agg(to_jsonb(br)), '[]'::jsonb)
      from public.buddy_photo_recipients br
      join public.buddy_photos bp on bp.id = br.photo_id
      where bp.owner_id = uid
    ),
    'garmin_hrv', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', h.summary_id,
        'calendar_date', h.calendar_date,
        'last_night_avg_ms', h.last_night_avg_ms,
        'last_night_5min_high_ms', h.last_night_5min_high_ms
      ) order by h.calendar_date), '[]'::jsonb)
      from public.garmin_hrv h
      where h.user_id = uid
    )
  );
end;
$$;


revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
