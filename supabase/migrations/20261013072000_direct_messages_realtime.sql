-- Live chat. direct_messages must be in the supabase_realtime publication so
-- an INSERT reaches the other person while their chat is open. Realtime
-- still applies row level security, so a subscriber only receives a row
-- their select policy allows. Safe to run more than once.

alter table public.direct_messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'direct_messages'
     ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
exception
  when undefined_object then null;
  when duplicate_object then null;
end $$;
