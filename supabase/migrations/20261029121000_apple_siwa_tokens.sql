-- Not applied. Do not run this from the app or from a deploy.
-- One Apple refresh token per person, so account deletion can revoke Sign in with Apple.
-- No grant to authenticated, anon, or public. The service role writes it.
-- The authorization code is not stored.

create table public.apple_siwa_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null check (char_length(refresh_token) between 1 and 2000),
  updated_at timestamptz not null default now()
);

revoke all on table public.apple_siwa_tokens from public, anon, authenticated;

alter table public.apple_siwa_tokens enable row level security;

comment on table public.apple_siwa_tokens is
  'Apple refresh token for the owner. account-delete revokes it. Nobody else can read it.';
