-- Not applied from this repo. Review this file before it runs.
-- A per-person plan comp. expires_at null means it does not run out.
-- The person can read their own row. Writes stay with the service role.

create table public.entitlement_overrides (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tier text not null,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tier in ('standard', 'pro', 'max'))
);

create trigger entitlement_overrides_touch
  before update on public.entitlement_overrides
  for each row execute function public.touch_updated_at();

alter table public.entitlement_overrides enable row level security;

create policy entitlement_overrides_select_own on public.entitlement_overrides
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.entitlement_overrides from public, anon, authenticated;
grant all on table public.entitlement_overrides to service_role;
grant select on table public.entitlement_overrides to authenticated;

comment on table public.entitlement_overrides is
  'Plan comp for one person. Null expires_at does not run out. Select own row only. Service role writes.';
