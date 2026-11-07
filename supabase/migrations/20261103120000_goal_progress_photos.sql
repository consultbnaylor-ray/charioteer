-- Not applied. Ben approves before this runs.
-- Private photos on the goal progress graph. Owner only. Not sent to Thumos.
-- Images live in the private bucket goal-progress-photos at {user_id}/{photo_id}.jpg.
-- No new camera or photo-library permission. The existing usage strings stay.

create table public.goal_progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recorded_on date not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint goal_progress_photos_path_owner check (storage_path = user_id::text || '/' || id::text || '.jpg')
);

create index goal_progress_photos_user_day on public.goal_progress_photos (user_id, recorded_on);

alter table public.goal_progress_photos enable row level security;

create policy goal_progress_photos_select on public.goal_progress_photos
  for select to authenticated
  using (user_id = auth.uid());

create policy goal_progress_photos_insert on public.goal_progress_photos
  for insert to authenticated
  with check (user_id = auth.uid());

create policy goal_progress_photos_delete on public.goal_progress_photos
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.goal_progress_photos from public, anon, authenticated;

grant select (id, user_id, recorded_on, storage_path, created_at) on public.goal_progress_photos to authenticated;
grant insert (id, user_id, recorded_on, storage_path) on public.goal_progress_photos to authenticated;
grant delete on public.goal_progress_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goal-progress-photos', 'goal-progress-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists goal_progress_photos_storage_read on storage.objects;
create policy goal_progress_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'goal-progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists goal_progress_photos_storage_insert on storage.objects;
create policy goal_progress_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'goal-progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists goal_progress_photos_storage_delete on storage.objects;
create policy goal_progress_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'goal-progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );
