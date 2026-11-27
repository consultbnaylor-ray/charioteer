# Saved routes keep their line (Ben, 27 November 2026, t1135u/t1136u)

Not applied and not deployed. This note lists what has to happen, in order, and the privacy wording to change.

## What changes

- New saves write the snapped route line to `public.outdoor_routes.geometry` (existing nullable jsonb column): at most 500 `{latitude, longitude}` points, rounded to 5 decimal places (about 1 m). Adjust this route replaces it.
- The saved-route map shows that line, centred and zoomed to fit (`routeFrame`).
- A route with no line (every route saved before this, and any saved before the migration is applied) shows "Line not saved for this older route." and no map, instead of a map somewhere random.
- A drawn route is saved as kind `drawn` and labelled "Your drawn route". `loop` is only for a loop from the settings. Before this, RouteMaker saved a drawn route as `loop` (or `point_to_point`).

## Apply, in this order

1. Ben approves the privacy wording below (and the solicitor folds it into the DPIA).
2. Apply `supabase/migrations/20261127180000_outdoor_routes_keep_line.sql` to the live project. It only adds column grants on `geometry` (select, insert, update) to `authenticated`, the `outdoor_routes_geometry_line` check, and a column comment. RLS (`outdoor_routes_own`) is unchanged. Nothing for `anon` or `public`.
3. Ship the app build. Until step 2, the app saves without the line (it retries without `geometry` on a permission or check error) and reads without it, so the build is safe to ship first.
4. No edge function change. `account-delete` deletes the auth user, and that cascades `auth.users` → `profiles` → `outdoor_routes` (both foreign keys are `on delete cascade`). Delete in the app removes the row.
5. `export_my_data` is unchanged: it still drops `geometry`, the same rule as Garmin tracks. If Ben wants the line in Download my data, that is a separate migration.

## Existing routes

The live table has 2 saved routes. Both are `kind = loop` and both have no line. Nothing stored tells a drawn route from a generated loop, so those two keep the "Loop" label. Ben can rename or delete and re-save them; a re-saved drawn route is stored as `drawn`.

## Privacy wording to change (not changed in this PR)

Storing the line is location data linked to the user, stored on the account (London), owner-only, deleted with the route or the account, never logged, never shared.

- `docs/privacy.md` paragraph on route finding ("A saved route stays on your account. It is not sent to other people…"): add that the saved route keeps its line (rounded to about 1 m, up to 500 points), only you can see it, and Delete or deleting the account removes it.
- `docs/privacy.md` location paragraph ("A saved route is a line on your account. You can delete it."): now true again; add the rounding and that it is not in Download my data.
- `docs/privacy.md` Garmin paragraph ("…leaves out the positions, the same rule as saved routes."): still true while `export_my_data` is unchanged.
- `docs/privacy.html` ("A saved route stays on your account until you delete it…"): the same addition as privacy.md.
- `docs/dpia-location.md` line 3 ("The migration that stores a saved route has not been applied.") and line 45 ("A saved route is a name, a kind, a distance, a duration, and the line…" and the 64-point cap): update to 500 points, 1 m rounding, the new check, the export rule, and the apply date. The 20261029 drop-geometry decision is reversed and needs a dated approval line.
- `docs/store-privacy-labels.md`: Apple Precise Location is already "Linked to the user, App Functionality, not tracking"; confirm it now also covers the saved line on the account. Google Play Data safety: location collected and stored on the server (not only processed), not shared, user can request deletion.
