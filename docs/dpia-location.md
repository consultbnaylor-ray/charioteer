# Location note for the DPIA

This is a product note for the data protection impact assessment. It is not the assessment, and it is not legal advice. A solicitor should fold it into the DPIA before a public launch. The migration that stores a saved route has not been applied.

## What is new

Outside is Good, build 70, can read the phone's location while the map screen is open. Permission is while using the app. The person can refuse. The home page, the menu, and the saved-route list work without a fix. Walk this off (the craving walk) is parked: the screen stays in the repo behind `SHOW_WALK_THIS_OFF` (off) and is not shown.

The purpose sentence is: "Charioteer uses your location while the map is open, to show where you are, and during a walk, run, or cycle you start, to measure distance and pace. That measure runs only while the activity screen is open. Locking the phone pauses it. It is not tracked in the background. It is not shared with other people. A route is sent to the route service only if you turn route finding on. A route is stored only if you save it. A finished activity stores the distance, time, and pace on this phone, not the path."

A walk, run, or cycle uses that same while-using permission, and only while the activity screen is open. Locking the phone pauses it. The phone stores the activity, the date, the distance, the time, and the average pace. It does not store the path. The summary is not sent to the account, the route service, or the coach. Spoken lines are the phone's own voice, from a list on the phone. No new permission and no background mode.

Proposed on 26 October 2026, not built, and not in the purpose sentence above. The Security and Compliance Bot advisory of the same day is folded into that proposal. A later outing would keep measuring after the phone locks, with the while-using permission, the `location` background mode, and the blue location indicator. Always location is not part of that proposal. There is no `NSLocationAlwaysAndWhenInUseUsageDescription`. Updates would start only when the person taps Start, and stop when they tap Stop, when they discard the outing, when the app is terminated, and after a time limit (four hours is the number recommended for Ben to confirm). The path would be in memory only for that outing. It would be cleared on Stop and on discard. If the app is killed mid-outing, the path is lost. There is no crash-recovery file unless Ben decides to add one, and that file would need complete-until-first-unlock protection, exclusion from iCloud and backups, and deletion within about 24 hours. The path would not be sent to the account, the route service, the coach, or anyone else. Coordinates would not be written to a log or to a crash or analytics breadcrumb. This repo has no Sentry, Bugsnag, Crashlytics, PostHog, Amplitude, or Mixpanel. Route finding stays separate and must not reuse the live path. An OpenRouteService request contains the start and the destination only. The saved summary would still omit the path. Spoken lines would be the phone's voice, with no microphone, and the audio background mode would be used only for that speech. The words for that proposal are in `docs/start-activity-decisions.md` and are not approved into the binary.

## Proposed processing activity: live on-device activity tracking

Not built. Not in the binary. Ben has not approved the build. This is the activity the advisory asks the DPIA to record. A solicitor still folds it into the assessment. This note is not that assessment and not legal advice.

- Purpose. Measure distance and pace, and give spoken updates, during a walk, run, or cycle the person started, including while the screen is locked or another app is in front.
- Lawful basis to confirm. The person starts it. iOS while-using permission is granted. An in-app explanation is shown before the system prompt. The working basis is that request. This note does not confirm the UK GDPR article.
- Data. Location fixes and the path, in memory on the phone, only while the outing is running, plus the distance, time, and pace derived from them. The path is cleared on Stop and on discard. If the process dies, the path is lost.
- Retention. None server-side. Nothing is written to Supabase. On the phone the path is not kept after Stop, discard, or process death. A finished summary, if they keep it, is the activity, the date, the distance, the time, and the average pace, with no path. That summary is the local store already described. It is not this path.
- Recipients. None for the path. It is not sent to HeiGIT, OpenFreeMap, the coach, xAI, analytics, or other people. Route finding is a separate activity. It must not reuse this path. Its request is the start and the destination only.
- No AI in v1. xAI does not receive the route. If a later version writes Thumos lines with xAI, the input is aggregate stats only, distance, time, and pace, and never coordinates. That later use is not approved. `XAI_PERSONAL_DATA_ENABLED` stays false.
- Risks. Someone with a lost or shared phone can infer where the person is if the outing screen is open. The blue location mark tells anyone looking at the phone that location is on. Live GPS uses battery. Mitigations in the proposal: updates start only on Start, stop on Stop, on termination, and after the time limit, the path is memory only, there is no server copy, there is no Always permission, and significant-change and region monitoring are not used, so a swipe-away does not relaunch the app.
- Rights. There is nothing server-side to export or erase, because the path is not sent. The path must not be added to `export_my_data`. It must not be combined with sobriety logs (`profiles.sobriety_started_at`, check-ins, or gratitude). A local summary without a path can be deleted on the phone.
- Privacy notice. A short Activity tracking section is in the privacy note, marked as this proposal and not as what the app does today.

## Data

- A live fix is held in memory on that screen. It is not written to the account and it is not sent to other people.
- Route finding is off until the person turns it on. The choice, the time, and the wording version are stored on the phone (AsyncStorage). There is no consent column and no consent table. Another phone starts off. Not now does not call the route function. Profile can turn it off, and the app then stops calling the function.
- When route finding is on, the phone calls a Charioteer function. The function calls OpenRouteService at api.heigit.org. The key stays in the function secret `ORS_API_KEY`. It is not in the app. The function requires a signed-in user (`verify_jwt` and a user lookup). It does not log the key, the request, or the place, including when the call fails.
- A route sends the coordinates and the travel type (`foot-walking`, `foot-hiking`, or `cycling-regular`) only. It does not send the Charioteer user id. It does not forward the phone's IP address. HeiGIT sees the server's address. A place search sends the words the person typed, and not the account number.
- HeiGIT's transparency statement (https://account.heigit.org/info/transparency-statement), read on 25 October 2026, says that for 7 days it keeps the full request and response, the IP address, and the API key, to look for abuse, and then deletes them. For openrouteservice it also keeps, with no end date, coordinates anonymised to two decimal places (their example is `[8.67, 49.41]`, about 1 km) and the non-personal direction parameters, plus request metadata (including the first 16 bits of the IP address). A place search uses the geocoding API. The same statement says the typed place and its coordinate are not kept past those 7 days. It says servers are in the EU. The statement says it is voluntary, non-binding, and not a source of legal claims. The April 2022 privacy policy (https://heigit.org/privacy-policy/) still says personal data is kept only as long as needed and does not give these day counts. The terms (https://account.heigit.org/info/tos) do not restate the 7 days. They do say not to transmit personal data apart from HeiGIT account-management data.
- The free Standard plan allows 2,000 direction requests a day and 40 a minute, and 3,000 geocoding requests a day (https://account.heigit.org/info/plans). The function caps the whole app at 1,500 requests a day, under that free directions quota, and one person at 40 a day and 12 in 10 minutes. The shared count needs the unapplied request table. Until that table exists, the cap is held in the running function only.
- OpenStreetMap data is ODbL. The screen credits contributors. It does not ask the person to accept OpenStreetMap terms. OpenRouteService geometry is CC-BY-SA 4.0. The credit "© openrouteservice by HeiGIT | Data from OpenStreetMap" stays visible, with "© OpenStreetMap contributors".
- A saved route is a name, a kind, a distance, a duration, and the line. Climb is kept when the later migration is applied. It is stored only after the person taps save. They can delete it. The live table still caps a line at 64 points and the kinds drawn and craving walk. The craving-walk kind name stays in the table. The Walk this off screen that would write it is parked and is not shown. A longer line is shortened for that table, and the distance from the service is the stored distance. The new migration that widens the table is in the repo and has not been applied.
- The table is `outdoor_routes`. The policy is the signed-in person only (`user_id = auth.uid()`). `public` and `anon` have no grant. There is no update grant. There is a delete grant. The first migration is in the repo. This note does not say it has been applied from here.
- A count table `outdoor_route_requests` is in the unapplied migration. It stores the person and the time. It does not store a place. The phone has no grant.
- The owner's data export does not yet include this table. That is a gap to close before launch, in a later reviewed change.
- Map tiles are requested from OpenFreeMap while the map is open. That request can include the map area, which is a coarse place, and the usual network data a tile host sees. OpenFreeMap's terms say they may use Cloudflare. This note does not replace their privacy notice. The map opens on the light Liberty style (`https://tiles.openfreemap.org/styles/liberty`). The dark style is `https://tiles.openfreemap.org/styles/dark`. Both style documents and their tiles are served from tiles.openfreemap.org. The phone remembers the choice locally (`charioteer.map-style`). Full screen does not add a host or a permission. The old routing host is not used. HeiGIT said it is switched off in the week of 16 November 2026. An earlier forum note said 2–6 November 2026.

## What is not collected

- The binary has no background location, no "always" location, and no visit monitoring. The proposal in the paragraph above is not in the binary.
- No motion-activity permission.
- No photo library permission is added for location or for Find a route.
- The microphone purpose sentence stays, because an audio component is in the app. Voice is switched off in this version. The sentence is: "Charioteer does not record audio. Voice is switched off in this version. Apple requires this note because an audio component is included in the app." Charioteer does not record audio.
- The Face ID purpose sentence stays, because a component can reference it. The sentence is: "Charioteer does not use Face ID. Apple requires this note because a component in the app can reference it." Charioteer does not use Face ID.

## Buddy photos

This is separate from location. It is a product note for the DPIA, not the assessment and not legal advice.

A buddy photo is an image and a caption (up to 140 characters). A caption about health or sobriety can be special category data. The audience is the accepted buddies the sender ticks. It is not the Community, and there is no public URL. A recipient does not receive the list of other recipients. Community switches do not publish the photo.

The file is a JPEG in the private bucket `buddy-photos`, at `{owner}/{id}.jpg`, longest side limited in the app, under 2 MB, with location metadata stripped before upload. The bucket is not public. A signed link lasts about 15 minutes. The migration and the storage policies are in the repo and have not been applied. `public`, `anon`, and `authenticated` have no table grant. Security-definer functions are the only read and write. The phone's anon key cannot select the table.

Retention is until the sender deletes the photo or the account. Hide marks one recipient and leaves the file. A report can outlive the photo. A gratitude tick is a second private file with its own delete. A library copy or a screenshot is outside Charioteer's delete. The screen says a screenshot cannot be stopped, and that deleting in the app does not remove a saved copy.

Save uses add-only photo permission (`NSPhotoLibraryAddUsageDescription`). The purpose sentence says the photo is added to the library and that a named Charioteer album is not created, because this SDK's album calls read the library. The app does not request a library read for Save. It does not read other photos.

Export includes the sender's photos, photos shared with that person (without other recipients), and the sender's recipient rows. Account deletion removes the `buddy-photos` folder before the auth user is deleted. Profile delete cascades the rows. None of this SQL has been applied from this repo.

The photo is not sent to the coach and not used for ads. Someone who receives it can still show it to another person. That limit is on the screen.
- Live routes can't be shared with anyone. That's to protect your safety. Nothing in this feature sends a route or a live fix to another person.

## Data flow

The phone does not call HeiGIT. The flow, and only after route finding is turned on, is: phone to the Charioteer function `outdoor-route`, then that function to HeiGIT at `api.heigit.org`. The function sends coordinates and the travel type for a route, or the typed words for a place search. It does not send the Charioteer user id and it does not forward the phone's address. A saved route, if the person taps save, stays in `outdoor_routes` on their account. The request count, when the later migration is applied, stores the person and the time only.

## Suppliers

- HeiGIT gGmbH. OpenRouteService at api.heigit.org. EU servers, as stated on the transparency statement. Used only when route finding is on. Receives coordinates and the travel type, or typed place words. No data-processing agreement and no signed agreement. See the open items.
- OpenFreeMap, and Cloudflare where OpenFreeMap's terms say they may use it. Map tiles while the map is open. The saved route is not sent to them.

## Risk

A start point can be a home or the place where someone is dealing with a craving. HeiGIT keeps a rounded coordinate, about 1 km, with no end date, so an area can still be inferred. The mitigations are: route finding is off until the person turns it on; they can pick an example start instead of where they are; a live fix is not stored; a route is stored only if they tap save; they can delete a saved route; they can turn route finding off, and the app then stops calling the function. Location stays foreground only. The screens say this is not medical advice and name a GP, NHS 111, 999, and Samaritans. Walk this off is parked, so those lines are on the live Outside is Good screens.

There is no data-processing agreement and no signed agreement with HeiGIT. The terms say not to transmit personal data apart from their account-management data. A coordinate can be personal data. That gap is open.

## Open items

- Ask HeiGIT in writing whether end-user location coordinates may be sent, and ask for a data-processing agreement.
- Before a public launch, self-host OpenRouteService in the EU, or get a written agreement. Do not open the hosted API to the public on the current terms alone.

## Lawful basis to confirm

The working basis is the person's request to draw a walk (a step they take), plus the explicit system permission. Confirm the UK GDPR basis and the App Store label before release. This note is not that confirmation.
