-- Build 70. Not applied.
-- A saved route can keep a longer line, a loop or an A to B, and a climb.
-- Route requests are counted without storing a place.
-- Apply only after a separate approval. The app still saves a shorter line before this is applied.
-- This file does not change export_my_data.

alter table public.outdoor_routes drop constraint if exists outdoor_routes_geometry_is_line;
alter table public.outdoor_routes add constraint outdoor_routes_geometry_is_line check (
  jsonb_typeof(geometry) = 'array'
  and jsonb_array_length(geometry) between 2 and 2000
);

alter table public.outdoor_routes drop constraint if exists outdoor_routes_kind_check;
alter table public.outdoor_routes add constraint outdoor_routes_kind_check check (
  kind in ('drawn', 'craving_walk', 'loop', 'point_to_point')
);

alter table public.outdoor_routes add column if not exists ascent_m integer;
alter table public.outdoor_routes drop constraint if exists outdoor_routes_ascent_m_check;
alter table public.outdoor_routes add constraint outdoor_routes_ascent_m_check check (
  ascent_m is null or ascent_m between 0 and 20000
);

revoke all on table public.outdoor_routes from public, anon, authenticated;

grant select (
  id, user_id, title, kind, distance_m, duration_minutes, geometry, created_at, ascent_m
) on public.outdoor_routes to authenticated;

grant insert (
  id, user_id, title, kind, distance_m, duration_minutes, geometry, ascent_m
) on public.outdoor_routes to authenticated;

grant delete on table public.outdoor_routes to authenticated;

comment on column public.outdoor_routes.ascent_m is
  'Climb returned with the route, in metres. Empty when the service did not return one.';

create table if not exists public.outdoor_route_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists outdoor_route_requests_user_created
  on public.outdoor_route_requests (user_id, created_at desc);

revoke all on table public.outdoor_route_requests from public, anon, authenticated;

alter table public.outdoor_route_requests enable row level security;

drop policy if exists outdoor_route_requests_own on public.outdoor_route_requests;
create policy outdoor_route_requests_own on public.outdoor_route_requests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.outdoor_route_requests is
  'A count of route requests for the signed-in person. No place is stored. The phone has no grant.';
