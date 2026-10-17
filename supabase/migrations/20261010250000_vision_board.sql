-- Private vision board. Additive. Owner-only. Other people cannot read it.
-- Pictures stay in the private bucket vision-board. Thumos may later read the
-- statement and captions when coach consent is on. It never receives the files.
-- The directory trigger is unchanged: it still copies display name, town,
-- the community flag, and age only.
--
-- Default privileges on a hosted project grant everything on a new table.
-- Those grants are revoked, then the columns the app writes are granted back.

alter table public.profiles
  add column vision_statement text
    check (vision_statement is null or char_length(vision_statement) <= 280);

alter table public.profiles
  add column vision_started_on date;

grant update (vision_statement, vision_started_on) on public.profiles to authenticated;

create table public.vision_board_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  caption text not null default '',
  area text,
  size text not null default 'medium',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vision_board_items_path_owner check (storage_path = user_id::text || '/' || id::text || '.jpg'),
  constraint vision_board_items_caption_length check (char_length(caption) <= 140),
  constraint vision_board_items_area check (
    area is null or area in ('health', 'family', 'home', 'career', 'travel', 'mind', 'money', 'other')
  ),
  constraint vision_board_items_size check (size in ('small', 'medium', 'large')),
  constraint vision_board_items_position check (position >= 0)
);

create index vision_board_items_user_position on public.vision_board_items (user_id, position, created_at);

alter table public.vision_board_items enable row level security;

create policy vision_board_items_select on public.vision_board_items
  for select to authenticated
  using (user_id = auth.uid());

create policy vision_board_items_insert on public.vision_board_items
  for insert to authenticated
  with check (user_id = auth.uid());

create policy vision_board_items_update on public.vision_board_items
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy vision_board_items_delete on public.vision_board_items
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.vision_board_items from public, anon, authenticated;

grant select (id, user_id, storage_path, caption, area, size, position, created_at, updated_at)
  on public.vision_board_items to authenticated;
grant insert (id, user_id, storage_path, caption, area, size, position)
  on public.vision_board_items to authenticated;
grant update (caption, area, size, position) on public.vision_board_items to authenticated;
grant delete on public.vision_board_items to authenticated;

create or replace function public.vision_board_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.vision_board_touch() from public, anon, authenticated;

create trigger vision_board_touch
  before update on public.vision_board_items
  for each row execute function public.vision_board_touch();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vision-board', 'vision-board', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vision_board_storage_read on storage.objects;
create policy vision_board_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vision-board'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists vision_board_storage_insert on storage.objects;
create policy vision_board_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vision-board'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists vision_board_storage_delete on storage.objects;
create policy vision_board_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vision-board'
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
    )
  );
end;
$$;
