-- Build 22. Additive. Owner-only memory of recent Thumos motivation tactics.
-- A movement reminder is off until the person opts in. The alert text is generic.

create table public.thumos_motivation_memory (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  recent_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint thumos_motivation_memory_len check (cardinality(recent_ids) <= 10)
);

alter table public.thumos_motivation_memory enable row level security;

create policy thumos_motivation_memory_own on public.thumos_motivation_memory
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.thumos_motivation_memory from public, anon, authenticated;
grant select, insert, update, delete on public.thumos_motivation_memory to authenticated;

alter table public.profiles
  add column if not exists movement_reminder boolean not null default false,
  add column if not exists movement_reminder_minute smallint;

alter table public.profiles
  drop constraint if exists profiles_movement_reminder_minute_check;

alter table public.profiles
  add constraint profiles_movement_reminder_minute_check
  check (movement_reminder_minute is null or (movement_reminder_minute >= 0 and movement_reminder_minute <= 1439));

grant update (movement_reminder, movement_reminder_minute) on public.profiles to authenticated;

comment on table public.thumos_motivation_memory is
  'Last motivation tactics for the owner. Thumos skips any id still in this list. Nobody else can read it.';

comment on column public.profiles.movement_reminder is
  'Opt-in local movement nudge. Off by default. The notification does not include health details.';
