-- Not applied. Do not run this from the app or from a deploy.
-- A saved route keeps the name, distance, time, and climb. The line is cleared.
-- Apply this with the app that stops writing geometry. Until then, a save that omits the line fails the old not-null check.
-- This file does not change export_my_data.

alter table public.outdoor_routes drop constraint if exists outdoor_routes_geometry_is_line;

alter table public.outdoor_routes alter column geometry drop not null;

update public.outdoor_routes set geometry = null where geometry is not null;

revoke all on table public.outdoor_routes from public, anon, authenticated;

grant select (
  id, user_id, title, kind, distance_m, duration_minutes, created_at, updated_at, ascent_m
) on public.outdoor_routes to authenticated;

grant insert (
  id, user_id, title, kind, distance_m, duration_minutes, ascent_m
) on public.outdoor_routes to authenticated;

grant update (
  title,
  kind,
  distance_m,
  duration_minutes,
  ascent_m,
  updated_at
) on table public.outdoor_routes to authenticated;

grant delete on table public.outdoor_routes to authenticated;

comment on column public.outdoor_routes.geometry is
  'Unused. Cleared so a saved route does not keep coordinates. The app does not read or write it.';
