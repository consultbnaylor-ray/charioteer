-- Not applied from this repo.
-- Adds the planned-session type "outdoor" (one Run/Walk session).
-- Does not add a column, a grant, or a policy. Routes and coordinates are not stored.
-- Owner-only access on planned_sessions is unchanged. Anonymous users still have no access.

do $$
begin
  if to_regclass('public.planned_sessions') is null then
    return;
  end if;
  alter table public.planned_sessions drop constraint if exists planned_sessions_session_type_check;
  alter table public.planned_sessions add constraint planned_sessions_session_type_check
    check (session_type in ('run', 'outdoor', 'cardio', 'strength', 'boxing', 'other'));
end $$;
