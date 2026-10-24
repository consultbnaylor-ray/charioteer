-- Build 38. Not applied from this repo.
-- Planned workouts for the signed-in person. Apply after review.
-- Owner only. Not shared. This file does not change export_my_data.

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_type text not null check (session_type in ('run', 'outdoor', 'cardio', 'strength', 'boxing', 'other')),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 10 and 240),
  note text not null default '' check (char_length(note) <= 280),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planned_sessions_user_starts on public.planned_sessions (user_id, starts_at);

revoke all on table public.planned_sessions from public, anon, authenticated;
grant select (
  id, user_id, session_type, starts_at, duration_minutes, note, done_at, created_at, updated_at
) on public.planned_sessions to authenticated;
grant insert (
  id, user_id, session_type, starts_at, duration_minutes, note, done_at
) on public.planned_sessions to authenticated;
grant update (
  session_type, starts_at, duration_minutes, note, done_at, updated_at
) on public.planned_sessions to authenticated;
grant delete on table public.planned_sessions to authenticated;

alter table public.planned_sessions enable row level security;

create policy planned_sessions_own on public.planned_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.planned_sessions is
  'Planned workouts for the signed-in person. Owner only. Not shared.';
