-- Build 27. Additive. Apply this before the select revoke.
-- Unblock was a filtered delete on public.blocks. PostgREST can only delete
-- rows the role can select, which is why 20261015060000 granted select on
-- blocker_id and blocked_id. This function deletes only the caller's row, so
-- the client no longer needs that grant.
-- The app does not list blocked people, so there is no list_my_blocks.
-- Block still inserts. notify-direct-message and notify-buddy-invite read
-- blocks with the service role. Leave 20261015260000_blocks_select_revoke.sql
-- unapplied until this function is live and the app calls it.

create or replace function public.unblock_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  delete from public.blocks
  where blocker_id = auth.uid()
    and blocked_id = target;
end;
$$;

revoke all on function public.unblock_user(uuid) from public, anon, authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

do $$
declare
  def text := pg_get_functiondef('public.unblock_user(uuid)'::regprocedure);
begin
  if def not ilike '%security definer%' or def not ilike '%search_path = public%' then
    raise exception 'unblock_user is missing security definer or a fixed search_path';
  end if;
  if position('blocker_id = auth.uid()' in def) = 0
     or position('blocked_id = target' in def) = 0 then
    raise exception 'unblock_user does not limit the delete to the caller';
  end if;
  if not has_function_privilege('authenticated', 'public.unblock_user(uuid)', 'execute') then
    raise exception 'authenticated cannot execute unblock_user';
  end if;
  if has_function_privilege('anon', 'public.unblock_user(uuid)', 'execute')
     or has_function_privilege('public', 'public.unblock_user(uuid)', 'execute') then
    raise exception 'unblock_user is executable by anon or public';
  end if;
end $$;
