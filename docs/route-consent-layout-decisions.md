# Route finding, short, with the keep still in view

Design only. Ben has not approved this. No screen change on this branch. No migration is written or applied. No deploy. `ios.buildNumber` stays 72. No new permission. No new purpose string. No SQL. Branched from the build 75 integration tip `ff6c958` (PR #46). Not shipped.

Ben, 27 October 2026: "It just doesn't look user friendly so can you move large body of text below the functionality, or put the core message in one small sentence a pre the more info button. The problem is, when humans see large bodies of text like that, they tend to not read it anyway."

He means the route-service retention line. Security wants that keep visible on the consent card and on the Profile switch before any external or store release. HeiGIT keeps the full request and response, the IP address, and the API key for 7 days, then deletes them. For a route, coordinates rounded to about 1 km, and the request metadata, are kept with no end date. Both screens need that keep in view, and the card short enough that a person will read it.

The layout proofs are drawings of the proposed cards. Each one is labelled "Proof of the design. Not the app." They are not screenshots of the running app. More info is closed in every drawing.

## What the code does today

Checked on `ff6c958`.

`RouteServiceNotice` in `src/ui/RouteServiceNotice.tsx` is the shared block. The consent card (`src/ui/RouteConsentCard.tsx`) and the Profile switch (`src/ui/RouteFindingSwitch.tsx`) both use it. Find a route shows the card before any route call (`src/app/(main)/find-route.tsx`). You shows the switch under Appearance (`src/app/(main)/profile.tsx`).

In view, in this order:

1. The first approved sentence.
2. More info, closed. The retention paragraph is inside it, so it is not on the card until the person opens More info.
3. "You can turn this off any time."

The consent card then shows "Not now leaves Outside is Good, saved routes, and the map working.", then **Turn on route finding**, then **Not now**.

The Profile card then shows the switch labelled Route finding, then the status line. With nothing stored yet, that line is "Off. Nothing is stored until you choose." When the switch is already on, the status line is "On since {when}. Stored on this phone only. Wording 2026-10-26-1."

Opening More info expands in place, above those controls, so the long text pushes the switch and the buttons down the card.

The lines inside More info, in this order, word for word:

- A route sends the coordinates and the travel type only. It does not send your name or account number. HeiGIT sees our server's address, not your phone's. A place search sends the words you type.
- HeiGIT's transparency statement says the full request and response, the IP address, and the API key are kept for 7 days to look for abuse, then deleted. For a route, coordinates rounded to about 1 km, and the request metadata, are kept with no end date. This is done on servers in the EU. The statement is voluntary and not a binding promise.
- Nothing is shared with other people.
- Location is used only while the app is open.
- HeiGIT transparency statement: https://account.heigit.org/info/transparency-statement
- This choice is stored on this phone only. Another phone starts off. Nothing is shared.
- © OpenStreetMap contributors
- © openrouteservice by HeiGIT | Data from OpenStreetMap
- OpenStreetMap data is available under the Open Database Licence. The credit names the contributors. This is not a request to accept OpenStreetMap terms.
- A route from the service is under CC-BY-SA 4.0. It stays on your account. It is not sent to other people.
- A start point can be personal data. HeiGIT terms say not to send personal data except for their own account. This test version sends a start point only after you turn route finding on.
- The April 2022 privacy policy (https://heigit.org/privacy-policy/) says personal data is kept only as long as needed. It does not give these day counts. The 7 days, the coordinates kept after rounding to two decimal places, and the EU servers are in the transparency statement. That statement says it is voluntary and not a binding promise. The terms (https://account.heigit.org/info/tos) do not restate the 7 days. A place search is geocoding. The same statement says the typed place and its coordinate are not kept past those 7 days.

`ROUTE_CONSENT_VERSION` is `2026-10-26-1`. Route finding stays on only when the stored choice is on and the version matches. A different version turns it off. The status line then reads "Off. The wording changed (2026-10-26-1). Turn it on again if you still want route finding. Stored on this phone only."

`src/domain/findRoute.test.ts` checks that the first line comes before More info, and that "You can turn this off any time." comes after More info. A later build updates that check. This sheet does not.

## Recommendation

Option 1.

Keep the approved first sentence, and keep "You can turn this off any time." Both stay in view, above the controls. Do not rewrite them.

The first sentence:

> The start point, the destination, and any points you add on the map are sent to our route service (OpenRouteService, built on OpenStreetMap data) to make the route.

Put one new sentence on both screens, immediately above More info, and under the controls. It carries the retention core. It is not approved until Ben says so.

> HeiGIT's transparency statement, which is voluntary and not a binding promise, says HeiGIT keeps the full request and response, the IP address, and the API key for 7 days, then deletes them, and keeps a route's coordinates rounded to about 1 km, and the request metadata, with no end date.

It is one sentence. It is longer than a slogan, because a shorter line would leave out part of what is kept. It names the full request and the response, the IP address, the API key, the 7 days and the deletion, a route's coordinates rounded to about 1 km, the request metadata, and no end date. It says the statement is voluntary and not a binding promise. "A route's coordinates" matches the approved line: a place search is not kept past the 7 days, and that limit stays in the note inside More info.

Two clauses from the approved paragraph stay in that paragraph, word for word, inside More info: "to look for abuse", and "This is done on servers in the EU." They say why the 7 days are kept, and where. They are not a further category of data. Option 2 puts them in the visible sentence if Ben wants them in view without a tap.

The new sentence does not replace the retention paragraph. That paragraph stays inside More info, word for word, with every other line in the list above, in the same order.

Move More info to sit below the functionality. On Find a route, below **Turn on route finding** and **Not now**. On You, below the switch and the status line. The long text is behind More info, under those controls. Opening More info no longer pushes the switch or the buttons down the card. More info stays closed until the person opens it.

The new sentence sits between the controls and More info, so it is on the card without a tap, and the buttons stay above it. On a short phone the sentence can continue below the first screenful. The control is reached first. Option 5 puts the sentence above the controls if Ben wants it read before the tap.

### Find a route, consent card

1. Route finding is off
2. The approved first sentence
3. You can turn this off any time.
4. Not now leaves Outside is Good, saved routes, and the map working.
5. Turn on route finding
6. Not now
7. The new sentence (not approved)
8. More info

### You, Profile switch

The same sentences when the switch is already on. Only the status line changes. The drawing shows the switch off, with nothing stored yet.

1. Route finding (the small label)
2. The approved first sentence
3. You can turn this off any time.
4. Route finding, with the switch
5. Off. Nothing is stored until you choose.
6. The new sentence (not approved)
7. More info

## Consent text and version

No change to `ROUTE_CONSENT_LINES`. No change to `ROUTE_CONSENT_VERSION`. It stays `2026-10-26-1`.

The new sentence is an extra line on the two screens. It is not added to `ROUTE_CONSENT_LINES`. The facts in it are already in the retention paragraph, which is already one of those lines.

A new version would turn route finding off for people who already turned it on, until they turn it on again. This sheet does not do that. Ben can ask for a fresh opt-in. That would be a version change, and it is not required to show this sentence.

No permission change. No purpose-string change. No SQL. `app.json` and `Info.plist` stay as they are. `ios.buildNumber` stays 72.

## Options

1. Recommended. The sentence above, under the controls and immediately above More info. More info below the controls. The remaining approved text stays inside More info, word for word.

2. The same layout, with a longer visible sentence that also carries "to look for abuse" and the EU servers. Still one sentence. Still not approved. Use this if those two clauses must be in view without a tap:

> HeiGIT's transparency statement, which is voluntary and not a binding promise, says HeiGIT keeps the full request and response, the IP address, and the API key for 7 days to look for abuse, then deletes them, and keeps a route's coordinates rounded to about 1 km, and the request metadata, with no end date, on servers in the EU.

3. A shorter sentence. Not recommended. It leaves out the response, the IP address, the API key, and the request metadata. It does not say the coordinates are a route's coordinates. It does not say the statement is voluntary and not a binding promise. That understates what is kept.

> The route service keeps the request for 7 days, then deletes it, and keeps coordinates rounded to about 1 km with no end date.

4. No new sentence. Move the current text below the controls, and leave the full retention paragraph in view under the controls, with the other long lines behind More info. Not recommended. The paragraph is still the large body Ben described. It does keep every approved word in view without a new sentence.

5. Put the new sentence above the controls, with the first sentence, and leave More info below the controls. The keep is then read before the tap. Not recommended as the default. The sentence is long enough that, with the first sentence, it pushes **Turn on route finding** down the card. That is the reading problem Ben named.

6. Add the new sentence and leave More info where it is today, above the controls. Not recommended. Opening More info still pushes the switch and the buttons down.

## Layout proofs

Drawings of option 1. Proof of the design. Not the app. More info is closed. Dark theme, the same colours as the app. Widths are 320 and 390.

The Find a route consent card. 320 wide, 1022 tall. 390 wide, 897 tall.

![Find a route consent card, 320 wide. Proof of the design. Not the app.](route-consent-layout/consent_320.png)

![Find a route consent card, 390 wide. Proof of the design. Not the app.](route-consent-layout/consent_390.png)

The Route finding card on You, under Appearance. The switch is off. 320 wide, 830 tall. 390 wide, 690 tall.

![Profile route-finding switch, 320 wide. Proof of the design. Not the app.](route-consent-layout/profile_switch_320.png)

![Profile route-finding switch, 390 wide. Proof of the design. Not the app.](route-consent-layout/profile_switch_390.png)

## Decisions for Ben

Not approved. Waiting on Ben.

1. Show this sentence on both screens, under the controls and immediately above More info? Recommendation: yes. "HeiGIT's transparency statement, which is voluntary and not a binding promise, says HeiGIT keeps the full request and response, the IP address, and the API key for 7 days, then deletes them, and keeps a route's coordinates rounded to about 1 km, and the request metadata, with no end date." Not approved until Ben says so.
2. Keep the approved first sentence and "You can turn this off any time." in view, above the controls, without rewriting them? Recommendation: yes.
3. Put More info below the buttons and below the switch, with the remaining approved text word for word inside it, in the current order? Recommendation: yes.
4. Leave the consent lines and the version `2026-10-26-1` unchanged? Recommendation: yes. Ben can ask for a fresh opt-in. That would be a version change.
5. No new permission, no new purpose string, and no SQL? Recommendation: yes.
