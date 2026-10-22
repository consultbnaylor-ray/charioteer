-- STOPGAP until build 23 removes the client query.
-- Build 22's openPrivateChat() runs `select blocker_id, blocked_id from blocks` before it
-- opens a thread. Signed-in users had no SELECT on public.blocks (20261010130000_tighten_grants),
-- so the query failed with 42501 and the app showed "Could not open a private message."
-- Only the two id columns are granted. Row security (policy blocks_own, for all,
-- blocker_id = auth.uid()) already limits every read to blocks the person made themselves,
-- so nobody can read who else has blocked whom, or who has blocked them. No data changes.
-- Build 23 deletes that client query; revoke this grant then.

grant select (blocker_id, blocked_id) on public.blocks to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.blocks'::regclass and polname = 'blocks_own'
  ) then
    create policy blocks_own on public.blocks
      for all to authenticated
      using (blocker_id = auth.uid())
      with check (blocker_id = auth.uid());
  end if;
end $$;
