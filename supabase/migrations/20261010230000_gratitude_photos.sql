-- Private photos on a gratitude line. Additive. Owner-only. Other people cannot
-- read them, and they are not sent to Thumos. The diary text stays in gratitude_entries.
--
-- Images live in the private bucket gratitude-photos at {user_id}/{photo_id}.jpg.
-- Storage policies let the signed-in owner read, write, and delete only that
-- folder. Deleting the line or the profile cascades these rows. Account
-- deletion removes the objects from the account-delete edge function.
-- export_my_data gains one key and keeps the previous keys.

create table public.gratitude_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.gratitude_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint gratitude_photos_path_owner check (storage_path = user_id::text || '/' || id::text || '.jpg')
);

create index gratitude_photos_user_entry on public.gratitude_photos (user_id, entry_id, created_at);

alter table public.gratitude_photos enable row level security;

create policy gratitude_photos_select on public.gratitude_photos
  for select to authenticated
  using (user_id = auth.uid());

create policy gratitude_photos_insert on public.gratitude_photos
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.gratitude_entries g
      where g.id = entry_id
        and g.user_id = auth.uid()
    )
  );

create policy gratitude_photos_delete on public.gratitude_photos
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.gratitude_photos from public, anon, authenticated;

grant select (id, entry_id, user_id, storage_path, created_at) on public.gratitude_photos to authenticated;
grant insert (id, entry_id, user_id, storage_path) on public.gratitude_photos to authenticated;
grant delete on public.gratitude_photos to authenticated;

-- A line holds at most four photos. The trigger runs as the table owner.
create or replace function public.gratitude_photos_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.gratitude_photos
    where entry_id = new.entry_id
  ) >= 4 then
    raise exception 'Four photos is the limit for one line.';
  end if;
  return new;
end;
$$;

revoke all on function public.gratitude_photos_limit() from public, anon, authenticated;

create trigger gratitude_photos_limit
  before insert on public.gratitude_photos
  for each row execute function public.gratitude_photos_limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gratitude-photos', 'gratitude-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gratitude_photos_storage_read on storage.objects;
create policy gratitude_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'gratitude-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists gratitude_photos_storage_insert on storage.objects;
create policy gratitude_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gratitude-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists gratitude_photos_storage_delete on storage.objects;
create policy gratitude_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gratitude-photos'
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
    )
  );
end;
$$;
