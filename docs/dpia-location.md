# Location note for the DPIA

This is a product note for the data protection impact assessment. It is not the assessment, and it is not legal advice. A solicitor should fold it into the DPIA before a public launch. The migration that stores a saved route has not been applied.

## What is new

Get Outside, build 70, can read the phone's location while the map screen is open. Permission is while using the app. The person can refuse. The home page, the menu, and the saved-route list work without a fix.

The purpose sentence is: "Charioteer uses your location only while the map is open, to show where you are. A route is sent to the route service only if you turn route finding on. It is not tracked in the background. It is not shared with other people. It is stored only if you save a route."

## Data

- A live fix is held in memory on that screen. It is not written to the account and it is not sent to other people.
- Route finding is off until the person turns it on. The choice, the time, and the wording version are stored on the phone (AsyncStorage). There is no consent column and no consent table. Another phone starts off. Not now does not call the route function. Profile can turn it off, and the app then stops calling the function.
- When route finding is on, the phone calls a Charioteer function. The function calls OpenRouteService at api.heigit.org. The key stays in the function secret `ORS_API_KEY`. It is not in the app. The function requires a signed-in user (`verify_jwt` and a user lookup). It does not log the key, the request, or the place, including when the call fails.
- A route sends the coordinates and the travel type (`foot-walking`, `foot-hiking`, or `cycling-regular`) only. It does not send the Charioteer user id. It does not forward the phone's IP address. HeiGIT sees the server's address. A place search sends the words the person typed, and not the account number.
- HeiGIT's transparency statement (https://account.heigit.org/info/transparency-statement), read on 25 October 2026, says that for 7 days it keeps the full request and response, the IP address, and the API key, to look for abuse, and then deletes them. For openrouteservice it also keeps, with no end date, coordinates anonymised to two decimal places (their example is `[8.67, 49.41]`, about 1 km) and the non-personal direction parameters, plus request metadata (including the first 16 bits of the IP address). A place search uses the geocoding API. The same statement says the typed place and its coordinate are not kept past those 7 days. It says servers are in the EU. The statement says it is voluntary, non-binding, and not a source of legal claims. The April 2022 privacy policy (https://heigit.org/privacy-policy/) still says personal data is kept only as long as needed and does not give these day counts. The terms (https://account.heigit.org/info/tos) do not restate the 7 days. They do say not to transmit personal data apart from HeiGIT account-management data.
- The free Standard plan allows 2,000 direction requests a day and 40 a minute, and 3,000 geocoding requests a day (https://account.heigit.org/info/plans). The function caps the whole app at 1,500 requests a day, under that free directions quota, and one person at 40 a day and 12 in 10 minutes. The shared count needs the unapplied request table. Until that table exists, the cap is held in the running function only.
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

## Data flow

The phone does not call HeiGIT. The flow, and only after route finding is turned on, is: phone to the Charioteer function `outdoor-route`, then that function to HeiGIT at `api.heigit.org`. The function sends coordinates and the travel type for a route, or the typed words for a place search. It does not send the Charioteer user id and it does not forward the phone's address. A saved route, if the person taps save, stays in `outdoor_routes` on their account. The request count, when the later migration is applied, stores the person and the time only.

## Suppliers

- HeiGIT gGmbH. OpenRouteService at api.heigit.org. EU servers, as stated on the transparency statement. Used only when route finding is on. Receives coordinates and the travel type, or typed place words. No data-processing agreement and no signed agreement. See the open items.
- OpenFreeMap, and Cloudflare where OpenFreeMap's terms say they may use it. Map tiles while the map is open. The saved route is not sent to them.

## Risk

A start point can be a home or the place where someone is dealing with a craving. HeiGIT keeps a rounded coordinate, about 1 km, with no end date, so an area can still be inferred. The mitigations are: route finding is off until the person turns it on; they can pick an example start instead of where they are; a live fix is not stored; a route is stored only if they tap save; they can delete a saved route; they can turn route finding off, and the app then stops calling the function. Location stays foreground only. The screens say this is not medical advice and name a GP, NHS 111, 999, and, on the craving walk, Samaritans.

There is no data-processing agreement and no signed agreement with HeiGIT. The terms say not to transmit personal data apart from their account-management data. A coordinate can be personal data. That gap is open.

## Open items

- Ask HeiGIT in writing whether end-user location coordinates may be sent, and ask for a data-processing agreement.
- Before a public launch, self-host OpenRouteService in the EU, or get a written agreement. Do not open the hosted API to the public on the current terms alone.

## Lawful basis to confirm

The working basis is the person's request to draw a walk (a step they take), plus the explicit system permission. Confirm the UK GDPR basis and the App Store label before release. This note is not that confirmation.
