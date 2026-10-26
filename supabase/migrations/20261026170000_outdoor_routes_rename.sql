-- Not applied. Build 75. Do not run this from the app or from a deploy.
-- Owner-only rename of a saved route.
-- outdoor_routes_own already requires user_id = auth.uid().
-- This grant does not add a policy, and it does not grant anything to public or anon.
-- It does not grant update of user_id.
-- If the wider grant in 20261026171000_outdoor_routes_update.sql is applied, do not also apply this one.
-- Does not change export_my_data. A saved route stays out of the download. The outing path is not in the export.

grant update (title, updated_at) on table public.outdoor_routes to authenticated;
