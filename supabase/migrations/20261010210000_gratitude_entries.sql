-- Private gratitude diary. Additive. Owner-only. Not part of the community.
--
-- created_by is not used. The row belongs to user_id. Deleting the profile
-- removes the rows. export_my_data gains one key and keeps the previous keys.

create table public.gratitude_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  category text check (
    category is null
    or category in ('People', 'Health', 'Progress', 'Small joys', 'Nature', 'Other')
  ),
  is_favourite boolean not null default false,
  entry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gratitude_entries_user_date on public.gratitude_entries (user_id, entry_date desc);

create trigger gratitude_entries_touch
  before update on public.gratitude_entries
  for each row execute function public.touch_updated_at();

alter table public.gratitude_entries enable row level security;

create policy gratitude_entries_select on public.gratitude_entries
  for select to authenticated
  using (user_id = auth.uid());

create policy gratitude_entries_insert on public.gratitude_entries
  for insert to authenticated
  with check (user_id = auth.uid());

create policy gratitude_entries_update on public.gratitude_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy gratitude_entries_delete on public.gratitude_entries
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.gratitude_entries from public, anon, authenticated;

grant select (
  id,
  user_id,
  body,
  category,
  is_favourite,
  entry_date,
  created_at,
  updated_at
) on public.gratitude_entries to authenticated;

grant insert (
  user_id,
  body,
  category,
  is_favourite,
  entry_date
) on public.gratitude_entries to authenticated;

grant update (
  body,
  category,
  is_favourite,
  entry_date
) on public.gratitude_entries to authenticated;

grant delete on public.gratitude_entries to authenticated;

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
    )
  );
end;
$$;
