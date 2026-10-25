# Get Outside

Plan only. Ben has said go, and has placed the section in the top-left hamburger menu. This file does not add a screen, a map library, a permission, or an API key. Nothing here is shipped.

Phase 1 is built later, as its own binary, after Ben has approved this plan and the map choice in [map-decision.md](map-decision.md). It takes the next free build number. It does not reuse 67 or 68. See [Build number](#build-number) before anyone bumps `app.json`.

Prices, free limits, and licence notes were read from the vendors’ public pages on 25 October 2026 and written up in the decision sheet. They exclude VAT where the page says so. Confirm them again before a key is created or a bill is accepted. If this file and the decision sheet disagree, use the decision sheet.

## What Ben has already decided

- The working name is **Get Outside**.
- It opens from a clearly labelled row in the existing hamburger menu (the top-left button whose accessible name is Menu).
- It is not a seventh bottom tab.
- It is not a swap that removes an existing tab.
- Optional shortcuts may also sit on Today and on Breathe, for the craving walk. Those shortcuts open this same page. They are not a second home for it.

## Name

Working name: **Get Outside**.

Still available if Ben wants a shorter or sharper label later:

| Name | Why it is still on the list |
| --- | --- |
| Outside | Shorter in the menu. Vaguer. It does not say the point, which is to go out. |
| Roadwork | Fits the boxing round timer and the Elite Athlete (Cruiserweight Boxer) goal. It undersells a craving walk, a daylight nudge, and a parkrun link. |

Recommendation: keep **Get Outside**. The menu row is wide enough for the two words. The boxing timer can still be named Roadwork inside the page.

## What the section is for

One page that helps someone go outdoors. Eight jobs, in the order Ben asked for them:

1. **Craving walk.** One tap. A 10–20 minute loop from where the person is now. Also offered from Breathe, and from Today. The original brief also named Thumos; that is the same button, held as a yes/no in [Decisions still open](#decisions-still-open).
2. **Round timer for roadwork.** 3-minute rounds, 1-minute rest, haptic bells, usable with the screen off. Shown to everyone. Called out when the goal is Elite Athlete (Cruiserweight Boxer) (`elite_cruiser_boxer`).
3. **Find me a loop.** Distance or time, and easy, steady, or hard. A circular route that prefers paths. Weather and daylight aware once those sources are allowed. Weather is not in the first version.
4. **Walk with a buddy.** Share a planned walk or run. No live location. The other person sees the plan and a Done tick. This follows the existing per-buddy share switches. It never sends a coordinate.
5. **Virtual journey.** Outdoor distance and sober days laid along a famous route, starting with Land’s End to John o’ Groats, with landmarks. Progress uses totals the account already has. It does not start a new kind of tracking.
6. **Daylight nudges.** An opt-in morning reminder for a light walk, using sleep and Body Battery already on the phone. The reminder stays on the device.
7. **Money-saved miles.** The money already calculated from not drinking, linked to a walking goal the person picks. No new money figure.
8. **parkrun.** A plain link out to parkrun’s own site. No parkrun data, no logo, no scrape.

Two neighbours, queued outside this page’s first build:

- **Add to Calendar** for a planned route, reusing the system add-event sheet. No calendar permission.
- **Send a route to Garmin** as a course. Optional, and only after a separate Garmin review. Not in phase 1.

## Navigation

The bottom bar already has six equal-width tabs: Today, Check-in, Breathe, Thumos, People, Gratitude. Gratitude is the widest label. A seventh label would shrink every tab. That is why Get Outside does not go there, and why nothing is removed to make room.

The top-left control is the hamburger. Its accessible name is **Menu**. It opens the existing drawer (`SectionDrawer`), a 320-point panel titled **Menu**, grouped Main / Tools / Account. The list is `APP_SECTIONS` in `src/domain/sections.ts`. A screen that is missing from that list does not appear in the drawer. On a wide window (980 points and up) the same Menu button sits at the top of the left rail, above those same six tabs. Get Outside stays in the drawer on that layout too. It does not become a seventh rail item.

Phase 1 adds one row:

| Field | Value |
| --- | --- |
| Place | Tools, directly under Workouts and directly above Progress photos |
| Label | Get Outside |
| Accessible name | Get Outside (the row label, same rule as every other row) |
| id | `outside` |
| href | `/outside` |
| Icon | A new monochrome line icon, same stroke as the other menu glyphs. Suggested: a simple path with a tree. |
| Tab | No. `tab` stays unset. `TAB_SECTIONS` stays six. |

The row highlights only on an exact `/outside` match, the same rule Health Plan and Workouts use (`menuSectionActive`). A child screen does not light the row unless that rule is extended on purpose.

Tapping the row closes the drawer and opens the page (`router.navigate`).

The Workouts menu test currently expects Progress photos to sit immediately under Workouts, and the gratitude menu test expects the full label list. Phase 1 updates those expectations. It does not add a tab.

### Shortcuts (optional, same page)

These are doors. They are not a second section.

- **Today.** A card in the existing mint-edge style. Title Get Outside. One filled action, **Walk this off**, opens the craving walk. A quieter line, **Open Get Outside**, opens the page.
- **Breathe.** After a breathing exercise, a text button **Walk this off** with the same destination.
- **Thumos.** The original brief asked for the same one-tap walk from Thumos. It is one button, not a new flow. Include it in phase 1 only if Ben says yes. See the decision list.

No shortcut adds a tab, a badge, or a swap.

```text
Top bar:  [ ≡ Menu ]  Charioteer          You
Drawer:   Menu
          Main     Today, Check-in, Breathe, Thumos, People, Gratitude Diary
          Tools    … Workouts
                   Get Outside     ← new row, opens /outside
                   Progress photos …
Bottom:   Today | Check-in | Breathe | Thumos | People | Gratitude
          (still six, unchanged)
```

Layout proofs (drawn, not the real app):

![Layout proof. Left: the top-left Menu button on Today, with six tabs unchanged. Right: the Menu drawer with Get Outside under Workouts.](layout-navigation.png)

![Layout proof. Get Outside page in the dark theme, opened from the menu, six tabs unchanged.](layout-page-dark.png)

![Layout proof. The same page in the light theme.](layout-page-light.png)

![Layout proof. A drawn loop on a stand-in map, with the safety line and OpenStreetMap attribution.](layout-map-dark.png)

Phase 1 screens, drawn in a browser as dark layout proofs. They are not screenshots of the running app. The map is a drawing, not a live tile. The source page is [phase1-proofs.html](phase1-proofs.html).

![Phase 1 proof. Menu drawer, dark. Get Outside sits under Workouts and above Progress photos. The six tabs are unchanged.](phase1-menu-dark.png)

![Phase 1 proof. Get Outside home, dark. Safety line, NHS 111 and 999, location optional, Walk this off.](phase1-home-dark.png)

![Phase 1 proof. Map, dark. Drawn footpaths, a saved route, attribution, and the safety line.](phase1-map-dark.png)

![Phase 1 proof. Craving walk, dark. A labelled sketch. Location only while the page is open.](phase1-craving-dark.png)

![Phase 1 proof. Today, dark. Walk this off, with the safety line.](phase1-today-dark.png)

![Phase 1 proof. Breathe, dark. Walk this off after the exercise, with the safety and crisis lines.](phase1-breathe-dark.png)

## Phased build

Effort is described by the pieces that change, not by calendar time. Each phase is its own review. None of them is the calendar binary.

### Phase 1 — the first Get Outside binary, after this plan is approved

The smallest useful version.

- Menu row, as specified above, and the page at `/outside`.
- MapLibre with a footpath-capable style. The map is a native module, so this phase needs a new iOS and Android binary. It does not run in Expo Go. See [Maps](#maps).
- Draw a route and save it on the signed-in account. Owner-only row. See [Data](#data).
- Craving walk: one tap, 10–20 minutes, a loop from the current fix. Until a router is cleared, the loop is a rough ring drawn on the phone from the fix and a radius. It is labelled as a sketch, not a path-following route. When a router is cleared, the same button swaps in the path-following loop without a new screen.
- Location permission, while the app is in use, asked only when a walk needs a fix. The page still opens with location off and lists saved routes. Copy and the system prompt are in [Privacy](#privacy).
- Today card and Breathe **Walk this off**, if Ben keeps them in this binary.
- Tests: the drawer label list includes Get Outside under Workouts; `TAB_SECTIONS` is still six; a saved route is owner-only; a shared profile, a buddy share, and a direct message still drop coordinates, paths, and start or end places.
- `npx tsc --noEmit` passes. `npx vitest run` keeps the same seven known failures and does not add an eighth.

This phase does not include the round timer, buddy sharing, the virtual journey, nudges, money-saved miles, parkrun, weather, calendar, or Garmin.

### Phase 2 — Find me a loop

Needs the routing decision. A Supabase edge function calls the router. The phone never holds the router key. Inputs are distance or time, and easy / steady / hard. The route prefers paths and returns to the start. Daylight is computed on the phone (sunrise and sunset from the date and a coarse position). Weather waits until a commercial weather source is chosen. The free Open-Meteo API is non-commercial, so it is not used.

### Phase 3 — Round timer

A clock on the page: 3 minutes work, 1 minute rest, haptic at each bell. Screen-off uses a local notification, not a silent audio trick and not a background location mode. Available to every goal. The Elite Athlete (Cruiserweight Boxer) goal gets a short line that this is the roadwork clock. It is a timer, not a training prescription.

### Phase 4 — Walk with a buddy

A plan row the owner chooses to share: title, start time, distance, duration, Done tick. The geometry stays on the owner’s route row and is not on the plan. The reader checks an accepted connection both ways, no block either way, and both accounts adult. It returns only those plan fields. It does not read Community switches and it does not publish the path. Existing share stripping (`sharedPayload.ts`) stays in force: distance and duration may remain, a coordinate or a path may not.

### Phase 5 — Virtual journey

A fixed list of landmarks for one route (Land’s End to John o’ Groats first). The marker advances from outdoor distance already saved on the account, and the sober-days count the account already stores. No new location history.

### Phase 6 — Daylight nudges

Opt-in. A local morning notification. The copy can mention sleep and Body Battery only as the reason the person turned it on. Those readings are not sent to a new server for this feature. Off until the person turns it on. No medical claim.

### Phase 7 — Money-saved miles

Uses the money-saved figure the app already calculates from weekly spend and sober days. The person picks a walking goal (for example, miles for each pound). No new financial field.

### Phase 8 — parkrun

One link to [https://www.parkrun.org.uk/](https://www.parkrun.org.uk/). Opens outside the app. Plain text. No parkrun logo, no feed, no results, no API.

### Later, not a phase of this page yet

- Add to Calendar on a planned route, through the system sheet. Get Outside does not add a calendar purpose string. The workout calendar sentence already lives on another branch.
- Garmin course upload, behind its own review.

## Maps

Checked against current MapLibre React Native docs and this app’s Expo SDK.

| Piece | This app | What MapLibre v11 asks for |
| --- | --- | --- |
| Package | not installed | `@maplibre/maplibre-react-native` v11 |
| Expo | `~57.0.27` | Expo 54 or newer |
| React Native | `0.86.3`, new architecture | React Native 0.80 or newer, new architecture only |
| React | `19.2.3` | React 19.1 or newer |
| Android | existing native binary | API 23 or newer |
| Expo Go | not how this app ships | Not supported. Add the config plugin, then a development or store build. |

The v11 screen component is `Map` with a `mapStyle`. It is not the older `MapView` name. A third-party Geoapify note has tried the library on Expo SDK 57. The official docs still require a native rebuild, which matches how Charioteer already ships. The dependency is added in phase 1, not in this plan.

The existing Apple Health route viewer (`react-native-maps` on iOS) stays as it is. It shows a workout the phone already has. It does not show a live location, and Get Outside does not reuse it for footpaths.

### Tiles and routing

The checked prices, free limits, licences, and the recommendation are in [map-decision.md](map-decision.md). Read that before approving a provider.

- OpenStreetMap’s own tile server (`tile.openstreetmap.org`) stays off the list. Attribution for whichever host is chosen sits on the map itself, in MapLibre’s attribution control.
- Draw phase 1 on **OpenFreeMap**. No tile key. Commercial use is allowed on their page. There is no service agreement, and they may stop the public instance without notice.
- Before a public launch, **Stadia Starter** ($20 a month on their pricing page) is the paid tile plan in the recommendation. Thunderforest Solo is the outdoors-style alternative, at a higher bill, and only after both styles have been looked at for footpaths. MapTiler Free is non-commercial, and a MapLibre app on MapTiler is billed per tile request.
- Phase 1 does not call a router. The craving walk is an on-device sketch until a solicitor has read OpenRouteService’s CC-BY-SA 4.0 results and the terms’ ban on sending personal data. The phone never holds a router key. Any later call uses `api.heigit.org`, from an edge function. The older host is deprecated. Two official shutdown dates are on record; the decision sheet cites both. If the solicitor says no, host the UK walking graph ourselves.

Overpass and Waymarked Trails are a later way to prefer named paths. They are not required to draw or save a route. Do not add them in phase 1.

Do not embed Komoot, Strava, or AllTrails, and do not scrape them. parkrun is a link out, nothing more.

## Data

Same shape as `planned_sessions`: the signed-in person only, row level security on, grants revoked from `public` and `anon`, then narrow column grants. The migration is written in phase 1 and applied only after a separate approval. This plan does not apply it.

`outdoor_routes` — the geometry. Owner only.

| Column | Notes |
| --- | --- |
| `id` | uuid, primary key |
| `user_id` | the owner, `auth.uid()` |
| `title` | short, length-capped |
| `kind` | `drawn` or `craving_walk` in phase 1. `loop` arrives with phase 2. |
| `distance_m` | integer |
| `duration_minutes` | integer |
| `geometry` | the line. Selected only by the owner’s own query. No share function lists this column. |
| `created_at`, `updated_at` | |

Policy: `user_id = auth.uid()` for read and write. No buddy policy on this table.

`outdoor_plans` — phase 4, and only if buddy sharing is approved. No geometry column at all, so a later mistake cannot leak a path through this table.

| Column | Notes |
| --- | --- |
| `id`, `owner_id` | |
| `title`, `starts_at`, `distance_m`, `duration_minutes`, `done_at` | the whole shared plan |

`outdoor_plan_shares` — owner adds a buddy id on purpose. The reader is a security-definer function that checks the caller, an accepted connection both ways, no block either way, and both accounts adult. It returns the plan columns above and nothing else. It does not look at Community visibility.

The user’s own export (`export_my_data`) is not changed in the phase 1 migration. A later reviewed change should add the owner’s routes to that export so a person can download their own lines. Community profiles, buddy shares, and direct messages stay on today’s rule: distance, duration, and pace may remain; a coordinate, a path, or a start or end place may not.

No table stores a live fix, a breadcrumb, or a background ping.

## Privacy

The app has no location purpose string today, and no `expo-location` dependency. Phase 1 is the first time that changes, and only after this plan is approved.

- Permission is **while using the app**. iOS: when-in-use. Android: fine and coarse, foreground only.
- No background location, no “always”, no significant-change updates, no visit monitoring.
- The system prompt is preceded by a plain sentence in the app: “Charioteer uses your location to draw a walk while this page is open. It is not tracked in the background, and it is not shared.”
- The page works without a fix. Saved routes still open. The craving walk is the action that needs a fix, and it explains why before the prompt.
- Purpose strings are added in that phase, in the same words as the sentence above. They are not added by this plan. The decision sheet says the same thing and stops short of `app.json`.
- Privacy policy, the DPIA, and the App Store privacy labels change when location is added. The label is precise location, linked to the user, used for app functionality, not used for tracking. This plan is not that DPIA.
- Routes are the owner’s data. They are not a community field and not a buddy field. A buddy sees a plan only after phase 4, and only the fields in that plan.

## Honest claims

Wording on the page, including the More info sheet:

- A line on the map may follow a path that is unsurfaced, closed, or private. The app does not know.
- The app does not promise that a route is safe, legal, or passable.
- This is not medical advice and not a crisis service. Help & crisis lines stays where it is.
- The round timer is a clock. It does not prescribe training.
- A daylight reminder is a reminder. It does not claim to treat anything.
- The parkrun link is a link. It does not imply a partnership.

## Accessibility, theme, Android

- VoiceOver uses the visible label. The menu row’s accessible name is Get Outside. The map has a text summary (distance, time, and the safety line) so the picture is not the only way to understand the route.
- Targets stay at least 44 points, including Menu, the new row, and Walk this off.
- Type follows the existing Dynamic Type scale. Buttons do not clip at the largest setting.
- Light and dark both ship. Card edge stays the mint accent (`#D1FAE5` in dark, `#6EE7B7` in light). Words that must be read use the existing green (`#2DE0A0` dark, `#047857` light), not the pale edge.
- One More info control, the existing outlined green pill. No second info style.
- Android uses the same MapLibre plugin and the foreground location permissions above. The timer’s screen-off bell is a notification channel, because haptic behaviour differs by phone. The system back button already closes this drawer.

## API keys

None are created or requested by this plan.

| Key | When it would exist | Where it would live |
| --- | --- | --- |
| Tile key | Only if Stadia or MapTiler is chosen for a public build. OpenFreeMap needs none. | EAS secret, restricted to the app’s bundle id. Not in git. |
| Router key | Only after the ORS licence and personal-data review, or not at all if the graph is self-hosted. | Supabase secret, read by an edge function. Not in the app. |
| Weather key | Only if a later phase buys a commercial weather plan. | Same as the router key. Not in phase 1. |

## Decisions still open

1. **Tiles.** Recommendation, with the figures in the decision sheet: OpenFreeMap for the prototype, Stadia Starter before public launch.
2. **Router.** Recommendation: keep the GPS trace on the phone until a solicitor has read the CC-BY-SA terms and the personal-data clause. Phase 1 uses an on-device sketch. If the review fails, self-host the UK walking graph.
3. **Budget.** The prototype tile bill in the recommendation is $0. The first commercial tile bill, if we leave OpenFreeMap, is Stadia Starter at $20 a month, before tax.
4. **Shortcuts in the phase 1 binary.** Recommendation: Today and Breathe, as Ben named them. Thumos is the same button and was in the original brief; say yes or no.
5. **Name.** Recommendation: keep Get Outside. Outside and Roadwork stay on the list above.
6. **Build number.** See below. This plan does not pick a number.

## Build number

On this branch, `app.json` still has iOS build number **62**. This plan does not change it, and it does not add a location purpose string.

Build 68 is the calendar binary on `cursor/buddies-pending-top-daf4` (PR #31). That number is taken. An earlier draft of this file called Get Outside build 67. That draft is out of date. Get Outside takes the next free build number only after Ben approves a binary.

## What this change does not do

- No screen, no dependency, no config plugin, no purpose string.
- No API key, no Supabase secret, no edge function.
- No migration applied, and no migration file yet.
- No mixing into the calendar binary.
- No shipping.
