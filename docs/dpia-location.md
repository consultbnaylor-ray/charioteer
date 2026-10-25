# Location note for the DPIA

This is a product note for the data protection impact assessment. It is not the assessment, and it is not legal advice. A solicitor should fold it into the DPIA before a public launch. The migration that stores a saved route has not been applied.

## What is new

Get Outside, build 69, can read the phone's location while the map screen is open. Permission is while using the app. The person can refuse. The home page, the menu, and the saved-route list work without a fix.

The purpose sentence is: "Charioteer uses your location only while the map is open, to show where you are and to draw a walk. It is not tracked in the background. It is never shared. It is stored only if you save a route."

## Data

- A live fix is held in memory on that screen. It is not written to the account, not sent to anyone else, and not sent to a routing service. No routing service is called.
- A saved route is a name, a kind (drawn or craving sketch), a distance, a duration, and the line. It is stored only after the person taps save. They can delete it.
- The table is `outdoor_routes`. The policy is the signed-in person only (`user_id = auth.uid()`). `public` and `anon` have no grant. There is no update grant. There is a delete grant. The migration is in the repo and has not been applied.
- The owner's data export does not yet include this table. That is a gap to close before launch, in a later reviewed change.
- Map tiles are requested from OpenFreeMap while the map is open. That request can include the map area, which is a coarse place, and the usual network data a tile host sees. OpenFreeMap's terms say they may use Cloudflare. This note does not replace their privacy notice.

## What is not collected

- No background location, no "always" location, no visit monitoring.
- No motion-activity permission.
- No photo library permission is added for this feature.
- Live routes can't be shared with anyone. That's to protect your safety. Nothing in this feature sends a route or a live fix to another person.

## Risk

Location is special category-adjacent in practice because it can show where someone is while they are dealing with a craving. The mitigation is: optional, foreground only, not shared, and stored only as a route the person saves and can delete. The screens say this is not medical advice and name a GP, NHS 111, 999, and, on the craving walk, Samaritans.

## Lawful basis to confirm

The working basis is the person's request to draw a walk (a step they take), plus the explicit system permission. Confirm the UK GDPR basis and the App Store label before release. This note is not that confirmation.
