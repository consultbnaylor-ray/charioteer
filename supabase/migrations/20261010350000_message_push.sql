-- Build 14. Additive. Not applied from this repo.
-- Private-message push tokens, and the preference that turns those alerts on or off.
-- A database webhook on INSERT of public.direct_messages should POST to the
-- notify-direct-message edge function with the service role key. That function
-- sends "New message on Charioteer" (or the sender's name) and never the message text.
-- Apply this migration, then redeploy notify-direct-message and add that webhook.

alter table public.profiles
  add column message_notifications boolean not null default true,
  add column notify_sender_name boolean not null default false;

grant update (message_notifications, notify_sender_name) on public.profiles to authenticated;

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null check (char_length(expo_push_token) between 1 and 200),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index device_tokens_user_idx on public.device_tokens (user_id);

revoke all on table public.device_tokens from public, anon, authenticated;
grant select (id, user_id, expo_push_token, platform, created_at, updated_at) on public.device_tokens to authenticated;
grant insert (user_id, expo_push_token, platform) on public.device_tokens to authenticated;
grant update (expo_push_token, platform, updated_at) on public.device_tokens to authenticated;
grant delete on public.device_tokens to authenticated;

alter table public.device_tokens enable row level security;

create policy device_tokens_own on public.device_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- One send per message. Only the service role writes this. No client policy.
create table public.message_push_log (
  message_id uuid primary key references public.direct_messages (id) on delete cascade,
  sent_at timestamptz not null default now()
);

revoke all on table public.message_push_log from public, anon, authenticated;
alter table public.message_push_log enable row level security;

comment on table public.device_tokens is
  'Expo push tokens for the owner. The notify-direct-message function reads them with the service role after a direct_messages insert.';
