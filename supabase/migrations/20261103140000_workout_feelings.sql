-- Not applied. Ben approves before this runs.
-- Private notes on how a workout day felt. Owner only. Not sent to Thumos or xAI.

create table public.workout_feelings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recorded_on date not null,
  workout_key text not null default '',
  note text not null default '',
  effort smallint,
  mood smallint,
  updated_at timestamptz not null default now(),
  constraint workout_feelings_effort check (effort is null or (effort >= 1 and effort <= 10)),
  constraint workout_feelings_mood check (mood is null or (mood >= 1 and mood <= 10)),
  constraint workout_feelings_note_len check (char_length(note) <= 500),
  constraint workout_feelings_key_len check (char_length(workout_key) <= 80),
  constraint workout_feelings_owner_day unique (user_id, recorded_on, workout_key)
);

alter table public.workout_feelings enable row level security;

create policy workout_feelings_select on public.workout_feelings
  for select to authenticated
  using (user_id = auth.uid());

create policy workout_feelings_insert on public.workout_feelings
  for insert to authenticated
  with check (user_id = auth.uid());

create policy workout_feelings_update on public.workout_feelings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy workout_feelings_delete on public.workout_feelings
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.workout_feelings from public, anon, authenticated;

grant select (id, user_id, recorded_on, workout_key, note, effort, mood, updated_at)
  on public.workout_feelings to authenticated;
grant insert (user_id, recorded_on, workout_key, note, effort, mood)
  on public.workout_feelings to authenticated;
grant update (recorded_on, workout_key, note, effort, mood, updated_at)
  on public.workout_feelings to authenticated;
grant delete on public.workout_feelings to authenticated;
