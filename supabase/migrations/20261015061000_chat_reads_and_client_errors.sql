-- Build 23. Additive. Not applied from this repo.
-- Per-person read line for a private chat, and a short log of caught screen errors.
-- Neither table stores message text, names, or profile fields.

create table public.chat_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  read_through timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, connection_id)
);

create index chat_reads_connection_idx on public.chat_reads (connection_id);

revoke all on table public.chat_reads from public, anon, authenticated;
grant select (user_id, connection_id, read_through, updated_at) on public.chat_reads to authenticated;
grant insert (user_id, connection_id, read_through) on public.chat_reads to authenticated;
grant update (read_through, updated_at) on public.chat_reads to authenticated;

alter table public.chat_reads enable row level security;

create policy chat_reads_own on public.chat_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.connections
      where connections.id = chat_reads.connection_id
        and connections.status = 'accepted'
        and (connections.requester_id = auth.uid() or connections.addressee_id = auth.uid())
    )
  );

-- Moves the read line forward only. An older time does not uncover messages again.
create or replace function public.save_chat_read(p_connection_id uuid, p_read_through timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.chat_reads (user_id, connection_id, read_through)
  values (auth.uid(), p_connection_id, p_read_through)
  on conflict (user_id, connection_id) do update
    set read_through = excluded.read_through,
        updated_at = now()
    where public.chat_reads.read_through < excluded.read_through;
end;
$$;

revoke all on function public.save_chat_read(uuid, timestamptz) from public, anon;
grant execute on function public.save_chat_read(uuid, timestamptz) to authenticated;

create table public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  screen text not null check (char_length(screen) between 1 and 80),
  message text not null check (char_length(message) between 1 and 300),
  app_build text not null check (char_length(app_build) between 1 and 40),
  created_at timestamptz not null default now()
);

revoke all on table public.client_errors from public, anon, authenticated;
grant insert (user_id, screen, message, app_build) on public.client_errors to authenticated;

alter table public.client_errors enable row level security;

create policy client_errors_insert on public.client_errors
  for insert to authenticated
  with check (user_id = auth.uid());

comment on table public.chat_reads is
  'How far this person has read one accepted chat. Owner only. No message text.';

comment on table public.client_errors is
  'Caught screen errors: screen name, short message, app build, and time. No message text or profile fields.';
