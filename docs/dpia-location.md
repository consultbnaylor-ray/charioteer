# Location note for the DPIA

This is a product note for the data protection impact assessment. It is not the assessment, and it is not legal advice. A solicitor should fold it into the DPIA before a public launch. The migration that stores a saved route has not been applied.

## What is new

Get Outside, build 70, can read the phone's location while the map screen is open. Permission is while using the app. The person can refuse. The home page, the menu, and the saved-route list work without a fix.

The purpose sentence is: "Charioteer uses your location only while the map is open, to show where you are. A route is sent to the route service only if you turn route finding on. It is not tracked in the background. It is not shared with other people. It is stored only if you save a route."

## Data

- A live fix is held in memory on that screen. It is not written to the account and it is not sent to other people.
- Route finding is off until the person turns it on. The choice, the time, and the wording version are stored on the phone (AsyncStorage). There is no consent column and no consent table. Another phone starts off. Not now does not call the route function. Profile can turn it off, and the app then stops calling the function.
- When route finding is on, the start point and the destination are sent to a Charioteer function, which calls OpenRouteService at api.heigit.org. The key stays in the function secret `ORS_API_KEY`. It is not in the app. The function requires a signed-in user (`verify_jwt` and a user lookup). It does not log the place. HeiGIT's privacy policy (April 2022, https://heigit.org/privacy-policy/) says a request is kept only as long as needed, or for a legal retention period. It does not publish a fixed number of days. A 2021 forum reply mentioned 14 days for server logs. That number is not in the current policy. The forum's 90-day note is about the forum, not the routing API.
- HeiGIT's terms say not to send personal data except for their account. A coordinate can be personal data. Ben has accepted this for the test version. A solicitor should confirm it before a public launch. The quota is whatever plan the HeiGIT account page shows. This note does not state a number.
- OpenStreetMap data is ODbL. The screen credits contributors. It does not ask the person to accept OpenStreetMap terms. OpenRouteService geometry is CC-BY-SA 4.0. The credit "© openrouteservice by HeiGIT | Data from OpenStreetMap" stays visible, with "© OpenStreetMap contributors".
- A saved route is a name, a kind, a distance, a duration, and the line. Climb is kept when the later migration is applied. It is stored only after the person taps save. They can delete it. The live table still caps a line at 64 points and the kinds drawn and craving walk. A longer line is shortened for that table, and the distance from the service is the stored distance. The new migration that widens the table is in the repo and has not been applied.
- The table is `outdoor_routes`. The policy is the signed-in person only (`user_id = auth.uid()`). `public` and `anon` have no grant. There is no update grant. There is a delete grant. The first migration is in the repo. This note does not say it has been applied from here.
- A count table `outdoor_route_requests` is in the unapplied migration. It stores the person and the time. It does not store a place. The phone has no grant.
- The owner's data export does not yet include this table. That is a gap to close before launch, in a later reviewed change.
- Map tiles are requested from OpenFreeMap while the map is open. That request can include the map area, which is a coarse place, and the usual network data a tile host sees. OpenFreeMap's terms say they may use Cloudflare. This note does not replace their privacy notice. The old routing host is not used. HeiGIT said it is switched off in the week of 16 November 2026. An earlier forum note said 2–6 November 2026.

## What is not collected

- No background location, no "always" location, no visit monitoring.
- No motion-activity permission.
- No photo library permission is added for this feature.
- Live routes can't be shared with anyone. That's to protect your safety. Nothing in this feature sends a route or a live fix to another person.

## Risk

Location is special category-adjacent in practice because it can show where someone is while they are dealing with a craving. The mitigation is: optional, foreground only, not shared, and stored only as a route the person saves and can delete. The screens say this is not medical advice and name a GP, NHS 111, 999, and, on the craving walk, Samaritans.

## Lawful basis to confirm

The working basis is the person's request to draw a walk (a step they take), plus the explicit system permission. Confirm the UK GDPR basis and the App Store label before release. This note is not that confirmation.
