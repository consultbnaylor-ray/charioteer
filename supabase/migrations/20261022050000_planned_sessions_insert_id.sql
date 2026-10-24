-- Planned sessions are saved with a client-generated id so a save can be
-- retried once after a dropped connection without creating a duplicate.
-- Owner-only row-level security is unchanged.
grant insert (id) on table public.planned_sessions to authenticated;
