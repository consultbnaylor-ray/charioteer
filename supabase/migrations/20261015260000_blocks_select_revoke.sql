-- Build 27. Apply this ONLY after 20261015250000_unblock_user.sql is on the
-- live database and the installed app calls unblock_user. Applying it earlier
-- makes Unblock fail again, because a filtered delete needs this select.
-- Insert and delete on public.blocks stay, so Block still works.

revoke select (blocker_id, blocked_id) on public.blocks from authenticated;

do $$
declare
  n int;
begin
  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'blocks'
    and grantee = 'authenticated'
    and privilege_type = 'SELECT'
    and column_name in ('blocker_id', 'blocked_id');
  if n <> 0 then
    raise exception 'authenticated can still select blocks id columns';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'blocks'
    and grantee in ('authenticated', 'anon', 'PUBLIC')
    and privilege_type = 'SELECT';
  if n <> 0 then
    raise exception 'authenticated still has table-level SELECT on blocks';
  end if;

  select count(*) into n
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'blocks'
    and grantee = 'authenticated'
    and privilege_type = 'INSERT';
  if n <> 1 then
    raise exception 'authenticated lost INSERT on blocks';
  end if;
end $$;
