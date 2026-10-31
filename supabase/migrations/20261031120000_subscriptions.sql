-- Apple subscriptions. Not applied from this repo. Ben reviews this file before it runs.
-- A person can read their own row. Inserts and updates are service role only,
-- after the edge function has verified the StoreKit 2 JWS.

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  original_transaction_id text not null,
  product_id text not null,
  status text not null,
  expires_at timestamptz not null,
  is_trial boolean not null default false,
  environment text not null,
  updated_at timestamptz not null default now(),
  unique (original_transaction_id),
  check (original_transaction_id ~ '^[0-9A-Za-z._-]{1,128}$'),
  check (char_length(product_id) between 1 and 128),
  check (status in ('active', 'expired', 'revoked', 'grace', 'billing_retry', 'cancelled')),
  check (environment in ('Sandbox', 'Production', 'Xcode'))
);

create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.subscriptions from public, anon, authenticated;
grant all on table public.subscriptions to service_role;
grant select on table public.subscriptions to authenticated;

comment on table public.subscriptions is
  'StoreKit subscription status for the signed-in person. Select own row only. Service role writes after JWS verification.';
