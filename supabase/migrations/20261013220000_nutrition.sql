-- Nutrition log. Additive. Existing rows are not updated or deleted.
--
-- Meals, water, and the wagon flag belong to the signed-in person.
-- Other people see today's meals or the wagon line only through
-- shared_nutrition, and only when Community is on, the person is 18 or over,
-- nobody has blocked the other, and that person has switched the share on.

create table public.nutrition_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  kcal_target integer check (kcal_target is null or kcal_target between 800 and 6000),
  hide_calories boolean not null default false,
  share_food_diary boolean not null default false,
  wagon_on boolean not null default false,
  wagon_note text not null default '' check (char_length(wagon_note) <= 200),
  wagon_visible boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  eaten_on date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  source text not null check (source in ('photo', 'text', 'manual')),
  note text not null default '' check (char_length(note) <= 500),
  items jsonb not null default '[]'::jsonb,
  estimated boolean not null default false,
  photo_path text,
  created_at timestamptz not null default now()
);

create index food_logs_user_day on public.food_logs (user_id, eaten_on desc, created_at);

create table public.nutrition_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  water_ml integer not null default 0 check (water_ml between 0 and 8000),
  primary key (user_id, day)
);

alter table public.nutrition_settings enable row level security;
alter table public.food_logs enable row level security;
alter table public.nutrition_days enable row level security;

create policy nutrition_settings_all on public.nutrition_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy food_logs_all on public.food_logs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy nutrition_days_all on public.nutrition_days
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.nutrition_settings from public, anon, authenticated;
revoke all on table public.food_logs from public, anon, authenticated;
revoke all on table public.nutrition_days from public, anon, authenticated;

grant select, insert, update, delete on public.nutrition_settings to authenticated;
grant select, insert, update, delete on public.food_logs to authenticated;
grant select, insert, update, delete on public.nutrition_days to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists food_photos_storage_read on storage.objects;
create policy food_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists food_photos_storage_insert on storage.objects;
create policy food_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

drop policy if exists food_photos_storage_delete on storage.objects;
create policy food_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name not like '%..%'
  );

create or replace function public.shared_nutrition(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner public.profiles%rowtype;
  settings public.nutrition_settings%rowtype;
  has_settings boolean := false;
  share_meals boolean := false;
  share_wagon boolean := false;
  meals jsonb := '[]'::jsonb;
begin
  if uid is null or target is null then
    return null;
  end if;

  select * into owner from public.profiles where id = target;
  if not found or owner.community_visible is not true or owner.age_confirmed_18 is not true then
    return null;
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = uid)
  ) then
    return null;
  end if;

  select * into settings from public.nutrition_settings where user_id = target;
  has_settings := found;
  if has_settings then
    share_meals := settings.share_food_diary;
    share_wagon := settings.wagon_on and settings.wagon_visible;
  end if;

  if share_meals then
    select coalesce(jsonb_agg(jsonb_build_object(
      'meal', f.meal,
      'note', f.note,
      'estimated', f.estimated,
      'items', f.items
    ) order by f.created_at), '[]'::jsonb)
      into meals
    from public.food_logs f
    where f.user_id = target
      and f.eaten_on = (timezone('Europe/London', now()))::date;
  end if;

  return jsonb_build_object(
    'hideCalories', case when has_settings then settings.hide_calories else false end,
    'meals', case when share_meals then meals else '[]'::jsonb end,
    'wagonOn', share_wagon,
    'wagonNote', case when share_wagon then settings.wagon_note else '' end
  );
end;
$$;

revoke all on function public.shared_nutrition(uuid) from public, anon;
grant execute on function public.shared_nutrition(uuid) to authenticated;

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
    )
  );
end;
$$;
