-- Not applied. Do not run this from the app or from a deploy.
-- Ben, 27 November 2026 (t1135u): a saved route keeps its line again, so the saved-route map
-- can show it, centred and zoomed to fit.
--
-- What is stored: the snapped route line the person chose to save, cut down to at most
-- 500 points by the app (1000 allowed here), each rounded to 5 decimal places (about 1 m),
-- as [{"latitude": .., "longitude": ..}, ..] in the existing nullable column outdoor_routes.geometry.
-- It is location data linked to the user. It is written only when they tap Save this route.
--
-- Who can see it: only the owner. RLS policy outdoor_routes_own (auth.uid() = user_id) is unchanged.
-- Nothing is granted to public or anon. user_id stays out of the update grant.
-- How it goes: Delete removes the row. account-delete deletes the auth user, which cascades
-- auth.users -> profiles -> outdoor_routes (outdoor_routes_user_id_fkey on delete cascade).
-- Export: export_my_data still leaves geometry out, the same rule as Garmin tracks. Changing that
-- is a separate decision (see docs/saved-routes-line.md).
-- Older rows stay null. The app shows "Line not saved for this older route." for them.
-- Until this is applied, the app saves without the line (it retries without geometry).

alter table public.outdoor_routes drop constraint if exists outdoor_routes_geometry_line;

alter table public.outdoor_routes add constraint outdoor_routes_geometry_line check (
  geometry is null
  or (
    jsonb_typeof(geometry) = 'array'
    and jsonb_array_length(geometry) between 2 and 1000
    and pg_column_size(geometry) <= 131072
    and not jsonb_path_exists(
      geometry,
      '$[*] ? (@.type() != "object" || !exists(@.latitude) || !exists(@.longitude) || @.latitude.type() != "number" || @.longitude.type() != "number" || @.latitude < -90 || @.latitude > 90 || @.longitude < -180 || @.longitude > 180)'
    )
  )
);

grant select (geometry) on table public.outdoor_routes to authenticated;
grant insert (geometry) on table public.outdoor_routes to authenticated;
grant update (geometry) on table public.outdoor_routes to authenticated;

comment on column public.outdoor_routes.geometry is
  'The saved route line, owner-only. At most 1000 {latitude, longitude} points, about 1 m precision. Null for routes saved before 27 November 2026. Not in export_my_data. Never logged.';
