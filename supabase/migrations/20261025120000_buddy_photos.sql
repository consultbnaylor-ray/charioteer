-- Buddy photos. Not applied to the live project.
-- A photo sent from People, Buddies. Accepted buddies only. Never the Community.
-- Apply only after review. The app does not call these functions yet.
--
-- Files live in the private bucket buddy-photos at {owner_id}/{photo_id}.jpg.
-- The bucket is not public. A signed link is minted by the app for about 15 minutes.
-- Account deletion must also remove that folder. This file does not change
-- export_my_data or the account-delete function. Those edits travel with the app change.

create table public.buddy_photos (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 140),
  storage_path text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
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

create or replace function public.create_buddy_photo(photo uuid, caption text, recipients uuid[])
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

  insert into public.buddy_photos (id, owner_id, caption, storage_path)
  values (photo, uid, clean, uid::text || '/' || photo::text || '.jpg');

  insert into public.buddy_photo_recipients (photo_id, buddy_id)
  select photo, buddy_id
  from unnest(kept) as buddy_id;

  return jsonb_build_object('id', photo, 'recipients', to_jsonb(kept));
end;
$$;

revoke all on function public.create_buddy_photo(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.create_buddy_photo(uuid, text, uuid[]) to authenticated;

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
