-- Not applied from this repo.
-- Optional planned effort on a workout the signed-in person planned.
-- Apply after review, and only once public.planned_sessions exists.
-- Owner-only access is unchanged. Anonymous users still have no access.
-- This file does not change export_my_data.

do $$
begin
  if to_regclass('public.planned_sessions') is null then
    return;
  end if;
  alter table public.planned_sessions add column if not exists planned_effort text;
  alter table public.planned_sessions drop constraint if exists planned_sessions_planned_effort_check;
  alter table public.planned_sessions add constraint planned_sessions_planned_effort_check
    check (
      planned_effort is null
      or planned_effort in ('easy', 'moderate', 'hard', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10')
    );
  execute 'comment on column public.planned_sessions.planned_effort is ''Optional planned effort: Easy, Moderate, Hard, or 1 to 10. Null when unset. Owner only. Not shared.''';
  execute 'grant select (planned_effort) on table public.planned_sessions to authenticated';
  execute 'grant insert (planned_effort) on table public.planned_sessions to authenticated';
  execute 'grant update (planned_effort) on table public.planned_sessions to authenticated';
end $$;
