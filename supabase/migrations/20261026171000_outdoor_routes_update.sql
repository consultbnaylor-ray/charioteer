-- Not applied. Build 75. Do not run this from the app or from a deploy.
-- Replaces the line on the same saved route. Still owner-only.
-- Does not grant update of user_id. Does not grant anything to public or anon.
-- This grant includes title, so it also covers rename. Apply this one only if both are approved.
-- Does not change export_my_data. A saved route stays out of the download. The outing path is not in the export.

grant update (
  title,
  kind,
  distance_m,
  duration_minutes,
  geometry,
  ascent_m,
  updated_at
) on table public.outdoor_routes to authenticated;
