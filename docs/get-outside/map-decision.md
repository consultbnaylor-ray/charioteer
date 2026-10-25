# Map decision sheet

For Ben. Checked on 25 October 2026 from the providers’ own pages. Prices exclude VAT where the page says so. This sheet is the one to use if it and `plan.md` ever disagree. Nothing here creates a key, a permission, or a bill.

The pictures next to the plan are browser layout proofs. They are drawings of the dark screens. They are not the running app, and the map in them is not a live tile.

## What the map has to do

Show footpaths, let a person draw and save their own route, and later (not in phase 1) ask a router for a loop. Location stays optional. It is asked only while the page is open. There is no background tracking. A buddy, when that arrives, receives a plan: title, time, distance, duration, and a Done tick. They never receive a live location or the line on the map.

## Tiles

OpenStreetMap’s own picture server, `tile.openstreetmap.org`, is off the list. It is paid for by donations, it has no service agreement, and its [tile policy](https://operations.osmfoundation.org/policies/tiles/) forbids bulk download, prefetch, and offline packs. It can block an app without notice. Their vector tiles are a different service with a different policy. We would use a host that republishes OpenStreetMap data, drawn in the app with MapLibre.

| Host | What their page says | Money | Commercial use | Credit on the map |
| --- | --- | --- | --- | --- |
| [OpenFreeMap](https://openfreemap.org/) public instance | Free. No key, no account, no cookies. No stated cap on views or requests. [Terms](https://openfreemap.org/tos/), updated 14 October 2026: provided as-is by Hyperknot Software Kft. under Hungarian law. They may stop the service without notice. No service agreement. Cloudflare may carry the tiles. Offline: each download at most 3,000 tiles or 50 MB, at most 4 requests at once, with a User-Agent that names the app. | £0 | Yes. The site says so in those words. | “OpenFreeMap © OpenMapTiles Data from OpenStreetMap”. MapLibre adds this. The project code is MIT. The map data is still OpenStreetMap’s. |
| [Stadia Maps](https://stadiamaps.com/pricing/) Free | 200,000 credits a month. No extra usage. A standard vector tile is 1 credit. New accounts get 14 days of Professional, then this free plan. | $0 | Not allowed | [© Stadia Maps © OpenMapTiles © OpenStreetMap](https://docs.stadiamaps.com/attribution/) |
| Stadia Starter | 1,000,000 credits, then 3¢ per 1,000 more | $20 / month | Allowed | Same |
| Stadia Standard | 7,500,000 credits, then 2¢ per 1,000 | $80 / month | Allowed | Same |
| Stadia Professional | 25,000,000 credits, then 1.5¢ per 1,000 | $250 / month | Allowed | Same |
| [MapTiler](https://www.maptiler.com/cloud/pricing/) Free | 5,000 sessions and 100,000 API requests a month. Their logo stays on the map. Extra use is not sold; the free service pauses until next month. | $0 | The Free card says non-commercial. The comparison row for commercial use is blank on Free. | MapTiler logo required |
| MapTiler Flex | 25,000 sessions and 500,000 API requests. Extra API requests are $0.15 per 1,000 and are billed automatically. A spending limit can be set. | $30 / month | The comparison row shows a tick for Flex. | Logo can come off, except they still want it for 3D sessions |
| [Thunderforest](https://www.thunderforest.com/pricing/) Hobby | 150,000 tile requests a month. They call it a test plan. [Terms](https://www.thunderforest.com/terms/): they can change or withdraw the free plan. | £0 | The terms say “Commercial use is permitted and encouraged.” That sentence is not a separate Hobby promise. | “Maps © Thunderforest, Data © OpenStreetMap contributors”, with working links |
| Thunderforest Solo | 1,500,000 tile requests | $125 or €115 / month | Same terms | Same |
| Thunderforest Small Business | 15,000,000 tile requests. Bulk download starts here. | $255 or €235 / month | Same terms | Same |
| Thunderforest Large | “Significant increase in Quota.” No number on the page. | $525 or €475 / month | Same terms | Same |

A few readings that are easy to get wrong:

- Stadia’s pricing page says scaling is opt-in and that usage caps prevent a surprise bill. The same cards also list a price per extra thousand credits. This check did not find a separate page that shows the switch, so the opt-in wording is quoted from that pricing page and has not been tried in an account.
- MapTiler sessions are unlimited panning only when the map is their own SDK. Their FAQ says a third-party SDK such as MapLibre is billed as tile requests. One vector tile is 1 request. They say a usual vector view is about 4 requests, and a usual raster view is about 10–16.
- Thunderforest counts a vector-tile request and a static-map request as 10 ordinary tile requests. Their rough guide is 15–20 tiles for a typical page view. They email if a plan runs out, and they may throttle; they say they do not cut the map off for a short surge. Tiles are CC-BY-SA 4.0. OpenStreetMap data stays under the ODbL. Caching on the device is allowed. A caching proxy is not. Bulk download needs Small Business or higher.

How many tiles a small Charioteer might use is our guess, not a vendor figure. Fifty people, ten map opens a month, about twenty-five vector tiles each time they pan, is about 12,500 tiles a month. That sits inside every free allowance above. A product still cannot use Stadia Free or MapTiler Free, because those plans disallow commercial use. The same guess at about a thousand people is about 250,000 tiles a month. That is over Stadia Free (200,000), Thunderforest Hobby (150,000), and MapTiler Free’s API requests (100,000). It still sits inside Stadia Starter (1,000,000) and MapTiler Flex (500,000).

The OpenFreeMap styles listed on their site are Positron, Bright, Liberty, Dark, Fiord, and 3D. Nobody on this check walked a footpath and compared how clearly those styles draw it. That is still open. Thunderforest’s Outdoors style is the reason to look at them, and that comparison is also still open.

## Routing

Phase 1 does not call a router. The craving walk is a ring drawn on the phone and labelled as a sketch.

If a later phase asks a router, the candidate already in the plan is HeiGIT’s openrouteservice.

- [Plans](https://account.heigit.org/info/plans). Standard is free for everyone. Directions V2: 2,000 a day and 40 a minute. Geocoding: 3,000 a day and 100 a minute. The plans page does not use the word “commercial”.
- A HeiGIT staff reply on 12 October 2026, on [this forum thread](https://ask.openrouteservice.org/t/free-plan-in-an-app-with-a-paid-tier-license-cc-by-sa-4-0-personal-data-and-attribution-questions/8079), says commercial use is allowed on Standard. The same reply says results are CC-BY-SA 4.0 and that HeiGIT will not give licensing advice.
- [Terms](https://account.heigit.org/info/tos). Attribution: `© openrouteservice by HeiGIT | Data from OpenStreetMap`. Results are CC-BY-SA 4.0. One account per person. Prohibited conduct includes “Transmit personal data (apart from the data required by the HeiGIT account management)”. Their safety text says the map can be wrong and must not be the only guide.
- [Transparency statement](https://account.heigit.org/info/transparency-statement). For seven days they store the IP address, the API key, and the full request and response. After that they keep coordinates rounded to two decimal places, indefinitely, for openrouteservice. They say those rounded coordinates are non-personal. A precise GPS trace is a different question, and the terms already forbid sending personal data. A solicitor reads this before any fix leaves the phone.
- Call `api.heigit.org/openrouteservice/v2/directions/...`. The older host `api.openrouteservice.org` is deprecated. The [April 2026 announcement](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912) lists a shutdown window of 2–6 November 2026. The [HeiGIT blog on 22 October 2026](https://heigit.org/changes-in-the-openrouteservice-universe/) says the old web clients shut down on 16 November 2026 and the deprecated API address goes off in that same week. Use the later blog as the date to plan around, and do not build against the old host.
- The same blog says the new web client drops some profiles, including hiking, and that most routing options remain on the API. Whether foot-walking or hiking is still on the API was not confirmed by calling it. Unverified.
- The key, if one is ever created, lives only as a Supabase secret behind an edge function. It never goes in the app and never in an `EXPO_PUBLIC_` variable. This sheet does not create it.
- Their On-Premise plan is a copy on our own servers. Their page lists the quota as unlimited because the vendor limit does not apply. That is the fallback if the solicitor says a GPS trace cannot be sent.

Our guess, again not a vendor figure: about 100 direction requests a day is under the 2,000-a-day cap. Forty a minute is the tighter limit if many people tap at once.

Stadia’s pricing page also sells routing. This check did not extract a walking-profile quota or a credit cost for a directions call, so Stadia routing is unverified and is not the recommendation.

## Recommendation

1. Draw phase 1 on OpenFreeMap. No tile key. Commercial use is allowed. Put the attribution on the map. Accept that there is no service agreement and that they can stop.
2. Do not point the app at `tile.openstreetmap.org`.
3. Before a public launch, move to Stadia Starter at $20 a month if Ben wants a contract and a stated cap. Look at Thunderforest Solo ($125 or €115) only if their Outdoors style is clearly better for footpaths after both have been looked at on a phone.
4. Leave MapTiler. Free is non-commercial. Flex bills a MapLibre app per tile, and the extra requests bill themselves.
5. Leave the router out of phase 1. If a solicitor clears CC-BY-SA and the personal-data clause, call `api.heigit.org` from an edge function. If they do not, host the UK walking graph ourselves.
6. The prototype tile bill in this recommendation is $0. The first commercial tile bill, if we leave OpenFreeMap, is Stadia Starter at $20 a month, before tax.

## Permission and privacy strings

A location purpose string is expected when phase 1 is actually built, and only after Ben approves it. It is not in `app.json` on this branch. This change does not add it.

When that day comes, the string is while-in-use only:

- iPhone: `NSLocationWhenInUseUsageDescription`.
- Android: fine and coarse location, foreground only. No background location and no “always”.
- The sentence already in the plan: “Charioteer uses your location to draw a walk while this page is open. It is not tracked in the background, and it is not shared.”
- The privacy policy, the DPIA, and the App Store privacy labels change in that same binary. This sheet is not that DPIA.

OpenFreeMap’s offline rule also wants a User-Agent that names the app. That is a request header, not a phone permission.

This branch does not add a photo string or a calendar string. Those belong to other work.

## Library licence

MapLibre GL JS publishes a 3-clause BSD licence in [LICENSE.txt](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt). The React Native package `@maplibre/maplibre-react-native` (v11.5.0 on the main branch) has `"license": "MIT"` in its package.json. The `LICENSE.md` that file says it copies at publish time was empty when fetched. Treat the MIT line as a package field, and the licence text of that package as unverified. The native map engine’s own licence was not opened on this check.

## Still unverified

- How clearly OpenFreeMap’s styles, and Thunderforest Outdoors, draw a footpath. Not looked at on a phone.
- Thunderforest Large’s numeric quota. The page does not state one.
- Whether openrouteservice’s API still offers foot-walking or hiking. The new website dropped hiking. The blog says most options remain on the API.
- The exact day the old openrouteservice host goes off. Two official dates exist: 2–6 November 2026 in the April announcement, and the week of 16 November 2026 in the 22 October blog.
- The React Native MapLibre licence text, and the native engine’s licence.
- Stadia’s per-request cost for routing, and whether the “opt-in scaling” switch works the way the pricing page describes.
