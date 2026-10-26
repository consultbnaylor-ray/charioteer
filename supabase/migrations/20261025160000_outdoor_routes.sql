-- Build 69. Not applied from this repo.
-- Saved walks for the signed-in person. Apply only after a separate approval.
-- Owner only. Not shared. No live fix. This file does not change export_my_data.

create table public.outdoor_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  kind text not null check (kind in ('drawn', 'craving_walk')),
  distance_m integer not null check (distance_m between 0 and 200000),
  duration_minutes integer not null check (duration_minutes between 1 and 240),
  geometry jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outdoor_routes_geometry_is_line check (
    jsonb_typeof(geometry) = 'array'
    and jsonb_array_length(geometry) between 2 and 64
  )
);

create index outdoor_routes_user_created on public.outdoor_routes (user_id, created_at desc);

revoke all on table public.outdoor_routes from public, anon, authenticated;

grant select (
  id, user_id, title, kind, distance_m, duration_minutes, geometry, created_at
) on public.outdoor_routes to authenticated;

grant insert (
  id, user_id, title, kind, distance_m, duration_minutes, geometry
) on public.outdoor_routes to authenticated;

grant delete on table public.outdoor_routes to authenticated;

alter table public.outdoor_routes enable row level security;

create policy outdoor_routes_own on public.outdoor_routes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.outdoor_routes is
  'Saved walks for the signed-in person. Owner only. Not shared. No live location.';
