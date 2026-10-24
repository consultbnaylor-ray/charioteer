-- Private progress photos. Additive: a new table, a private storage bucket,
-- and an extra key on export_my_data. No existing column changes.
--
-- Images live in the private bucket progress-photos at {user_id}/{photo_id}.jpg.
-- Storage policies let the signed-in owner read, write, and delete only that
-- folder. The table stores the caption and the month, not the image bytes.
-- Account deletion removes the objects from the account-delete edge function;
-- deleting the auth user then cascades these rows.

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  taken_on date not null,
  month_index smallint not null check (month_index >= 0),
  note text not null default '' check (char_length(note) <= 280),
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint progress_photos_path_owner check (storage_path = user_id::text || '/' || id::text || '.jpg')
);

alter table public.progress_photos enable row level security;

create policy progress_photos_own on public.progress_photos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.progress_photos from public, anon, authenticated;
grant select (id, user_id, taken_on, month_index, note, storage_path, created_at) on public.progress_photos to authenticated;
grant insert (id, user_id, taken_on, month_index, note, storage_path) on public.progress_photos to authenticated;
grant delete on public.progress_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists progress_photos_storage_read on storage.objects;
create policy progress_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists progress_photos_storage_insert on storage.objects;
create policy progress_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists progress_photos_storage_delete on storage.objects;
create policy progress_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-photos'
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
    )
  );
end;
$$;
