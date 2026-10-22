-- Build 26. Additive. Apply after this commit.
-- Usual gym week for the signed-in person. The health-plan function reads it.
-- Owner only. Column grants include UPDATE on every column the client upsert sends.

create table public.training_schedules (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  monday boolean not null default false,
  tuesday boolean not null default false,
  wednesday boolean not null default false,
  thursday boolean not null default false,
  friday boolean not null default false,
  saturday boolean not null default false,
  sunday boolean not null default false,
  typical_minutes integer not null check (typical_minutes between 10 and 180),
  longer_day text check (
    longer_day is null
    or longer_day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  longer_minutes integer check (longer_minutes is null or longer_minutes between 10 and 240),
  walk_day text check (
    walk_day is null
    or walk_day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  note text not null default '' check (char_length(note) <= 280),
  updated_at timestamptz not null default now(),
  constraint training_schedules_some_day check (
    monday or tuesday or wednesday or thursday or friday or saturday or sunday
  ),
  constraint training_schedules_longer_day check (
    longer_day is null
    or (longer_day = 'Monday' and monday)
    or (longer_day = 'Tuesday' and tuesday)
    or (longer_day = 'Wednesday' and wednesday)
    or (longer_day = 'Thursday' and thursday)
    or (longer_day = 'Friday' and friday)
    or (longer_day = 'Saturday' and saturday)
    or (longer_day = 'Sunday' and sunday)
  ),
  constraint training_schedules_longer_minutes check (
    (longer_day is null and longer_minutes is null)
    or (longer_day is not null and longer_minutes is not null and longer_minutes > typical_minutes)
  ),
  constraint training_schedules_walk_day check (
    walk_day is null
    or (walk_day = 'Monday' and not monday)
    or (walk_day = 'Tuesday' and not tuesday)
    or (walk_day = 'Wednesday' and not wednesday)
    or (walk_day = 'Thursday' and not thursday)
    or (walk_day = 'Friday' and not friday)
    or (walk_day = 'Saturday' and not saturday)
    or (walk_day = 'Sunday' and not sunday)
  )
);

revoke all on table public.training_schedules from public, anon, authenticated;
grant select (
  user_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
  typical_minutes, longer_day, longer_minutes, walk_day, note, updated_at
) on public.training_schedules to authenticated;
grant insert (
  user_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
  typical_minutes, longer_day, longer_minutes, walk_day, note, updated_at
) on public.training_schedules to authenticated;
grant update (
  user_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
  typical_minutes, longer_day, longer_minutes, walk_day, note, updated_at
) on public.training_schedules to authenticated;
grant delete on table public.training_schedules to authenticated;

alter table public.training_schedules enable row level security;

create policy training_schedules_own on public.training_schedules
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.training_schedules is
  'Usual gym week for the signed-in person. Owner only. Not shared.';

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
    )
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

do $$
declare
  n int;
begin
  select count(distinct column_name) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'training_schedules'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
    and column_name in (
      'user_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      'typical_minutes', 'longer_day', 'longer_minutes', 'walk_day', 'note', 'updated_at'
    );
  if n <> 14 then
    raise exception 'training_schedules upsert columns are missing an UPDATE grant';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'training_schedules'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'UPDATE';
  if n <> 0 then
    raise exception 'training_schedules still has table-level UPDATE';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'training_schedules'
      and policyname = 'training_schedules_own'
      and coalesce(qual, '') ilike '%user_id%'
      and coalesce(qual, '') ilike '%auth.uid()%'
      and coalesce(with_check, '') ilike '%user_id%'
      and coalesce(with_check, '') ilike '%auth.uid()%'
      and 'authenticated' = any (roles)
  ) then
    raise exception 'training_schedules_own no longer forces user_id = auth.uid()';
  end if;
end $$;
