# Adjust a route on the map

Approved by Ben on 26 October 2026, as written in this note, including the purpose-string sentence and the consent line. It is in build 74. It is not shipped. The iOS build number stays 72.

Written the same day from Ben's iPhone note: "Can you add the ability to adjust the route with your finger on the map and it recalculates the distance etc."

The `outdoor-route` function is prepared to accept via-points and is not deployed. Deploying it needs a separate yes from Ben.

## What was approved

1. A finger on the line adds or moves a via-point. The start and the destination stay where Find a route put them.
2. The route is sent once, when the finger lifts, after a 500 millisecond pause. Five via-points is the cap. The phone shows how many route requests this phone has made today. The account limit stays 40 a day and 12 in 10 minutes, shared with place search. The phone does not show the shared remainder or the 1,500 app cap.
3. The purpose string, the route-finding consent, the privacy note, and the DPIA use the sentences below. Ben approved them on 26 October 2026. The consent version is `2026-10-26-1`, so the question is asked again.
4. If the redraw fails, the previous line, distance, climb, and time stay on the screen.
5. Adjust, then Save, stores one line on the account, as Save does today. A saved route does not grow a second list of via-points. Adjusting again means Make the route again.
6. Undo and Reset stay on the phone. They do not call the route service.

## How a person adjusts a found route

This starts only after Make the route has drawn a line. Walk this off stays parked. Adjust is not on that screen.

An **Adjust the route** button turns the gesture on. It is a button, so the gesture is not the only way in. While it is on, the map still shows the light or dark style, full screen, the credit, and Re-centre.

- Drag a point on the line, then lift. That adds a via-point. The route is pulled through it.
- Drag an existing via-point, then lift. That moves it.
- Tap a via-point, then **Remove point**. That takes it off.
- **Undo** puts back the last accepted line.
- **Reset** puts back the line from Make the route and clears every via-point.

The start and the destination are not dragged in this version. They stay the places chosen above the map. A loop still begins and ends at the start. An A to B line still runs from the start to the destination. The via-points sit between those two.

Undo and Reset use the lines already on the phone. They do not call the route service.

A lift that barely moved, under about 40 metres from where the finger went down, is ignored. No request is sent.

## Distance, climb, and time

The first Make the route call is unchanged. A loop is still one OpenRouteService round trip of the chosen length. An A to B line is still start and destination.

The first time a via-point is accepted, the next call is different. The phone sends the start, the via-points in order, and the destination. For a loop the destination in that call is the same point as the start, and the round-trip option is not sent again. OpenRouteService then draws a path through those points. The chosen 5 km, or whatever length was picked, is not sent again. The new length is the length of that path.

Distance, time, and climb are replaced together from that answer. The phone does not invent a distance from the straight line under the finger, and it does not invent climb. Climb uses the same ascent field as today. If the service omits it, the line stays "Climb not available for this route."

## Live preview

While the finger is down, the accepted line stays solid. A dashed segment follows the finger from the neighbouring points. That dash is a local sketch. It is not a path, and it is not sent.

The figures stay on the last accepted route. The screen says: "Release to redraw the route." Under the figures: "Last route. The figures change when the redraw finishes."

When the finger lifts, the dash remains and the solid line remains until the answer arrives. The screen says: "Redrawing the route." On success, the solid line and the three figures change together, and the dash goes. On failure, the dash goes, the new or moved point is dropped, and the last accepted line and figures remain.

## Requests, and the quota

Each redraw is one call to the `outdoor-route` function, which calls OpenRouteService at HeiGIT. The limits already in that function are 12 in 10 minutes, 40 a day for one person, and 1,500 a day for the whole app. A place search counts against the same limits. The count is the function call. A snap retry inside that call is not a second count.

Dragging must not spend those calls one finger-move at a time.

- Nothing is sent while the finger is down.
- One send happens when the finger lifts, after a 500 millisecond pause. A second lift during that pause replaces the first. One send leaves.
- If a call is already in flight, the phone keeps only the latest lift and sends it when the first call ends. One call runs, and one waits.
- At five via-points the line no longer grows. A drag moves or removes an existing point. The screen says: "5 of 5 points. Drag one to move it, or remove one."
- The screen shows a count this phone knows: "4 route requests on this phone today." The account limit is 40 a day and 12 in 10 minutes, shared with place search. Another phone on the same account shares that 40. The phone does not pretend to know the shared remainder. The 1,500 app cap is not shown. If either cap is hit, the person sees the rate-limited message below.

## Privacy

A via-point is another coordinate in the route request. It is the same kind of data as the start and the destination. HeiGIT's transparency statement, already recorded for those two, applies to these points as well: the full request for 7 days, then coordinates rounded to about 1 km with no end date. This design does not change that.

The Charioteer function still must not log the coordinates, and must not write them to `outdoor_route_requests`. That table stays the person and the time. Error text must not echo a coordinate. The same rule already strips coordinates out of a failure message.

Saving the route still stores the line on the account, because Save already does that. The via-points are not stored as their own list. The outing path is still not sent. Start a walk, run, or cycle does not send the line.

Ben approved the location purpose string, the consent line, and the privacy sentence on 26 October 2026. They are in the app and in the notices. The consent version moved to `2026-10-26-1`.

Approved purpose string. This is the whole sentence:

"Charioteer uses your location while you are on a walk, run or cycle to track distance and give you spoken updates, including when the screen is locked or you are using other apps. Your route stays on your phone and is not sent anywhere. The same permission shows where you are while the map is open. A route is sent to the route service only if you turn route finding on. That request is the start, the destination, and any points you add on the map. It is not the outing path."

Approved consent line. It replaces "The start point and the destination are sent to our route service (OpenRouteService, built on OpenStreetMap data) to make the route."

"The start point, the destination, and any points you add on the map are sent to our route service (OpenRouteService, built on OpenStreetMap data) to make the route."

Approved privacy and DPIA sentence:

"A route sends the start, the destination, any points you add on the map, and the travel type. It does not send your name or account number. The outing path is not sent."

The send line that already says "A route sends the coordinates and the travel type only" can stay, once the sentences above name the points. HeiGIT still sees the server's address, not the phone's.

## When the redraw fails

The previous line, distance, climb, and time stay. Nothing is saved by the failure. The point that was just dropped or moved is not kept.

- `no_path`. Keep the current message: "We couldn't find a path near that start. Try a start nearer a street or footpath." Add, approved by Ben on 26 October 2026: "The route on the map is unchanged."
- `rate_limited`. Keep: "You've made a lot of route requests. Try again in a little while." Add, approved by Ben on 26 October 2026: "The route on the map is unchanged." Adjust stays visible and the next lift tries again later. The phone does not keep sending in the meantime.
- `unavailable`, and no connection. Keep "The route service is not available right now. Nothing was saved." or "Check your connection and try again." Add, approved by Ben on 26 October 2026: "The route on the map is unchanged."

A failure does not clear the original Make the route line. Reset can still return to it.

## Saved routes, Start, light, dark, full screen

Adjust lives on the Find a route result, in the same card as the map, the name, and Save this route.

Save this route stores the accepted line, the distance, the time, and the climb, as it does today. Outside is Good lists that route. Delete still removes it. The list does not gain an edit control in this version. To change a saved route, Make the route again, adjust, and save. That avoids a second copy of the coordinates on the account.

Start a walk, Start a run, and Start a cycle keep using a chosen saved route as the line on the outing. They use the last accepted line. They do not call the route service, and they do not send the outing path. A dashed preview is never the line that Start uses.

The light and dark switch, full screen, and the credit stay the map controls that are already there. Changing style or opening full screen does not send a request. In full screen the figures, "Release to redraw the route.", Undo, Reset, and Remove point sit in a bar under the map, and the corner buttons stay clear of that bar. Dragging empty map pans. Dragging the line, with Adjust on, edits. Re-centre does not send a request.

## Accessibility, 320, and 390

Adjust the route, Undo, Reset, Remove point, and Save this route are buttons. Each target is at least 44 points. Via-points are numbered. The drawn dot can be small. The hit area is 44 points.

Add a point is a button as well as a drag. It drops a point on the middle of the line and does not send a request until the finger, or a later Move, lifts. VoiceOver reads the figures, then "Route line", then "Via point 1 of 5", then the buttons. Remove point is available when a via-point is selected.

The route colour is not the only signal. The via-point has a number, and the preview is dashed while the accepted line is solid.

At the larger text sizes the card scrolls. The map stays at least 180 points tall.

At 320 the card is one column. The figures wrap to two lines. Undo, Reset, and Remove point are each a full row. The credit stays under the map.

At 390 the map is taller. Undo and Reset sit on one row. Remove point stays a full row. The same sentences are used. Nothing is abbreviated at the narrower width.

## The outdoor-route function, prepared and not deployed

Deploying this function needs a separate yes from Ben. Nothing here has been deployed.

What the prepared function changes, and only this:

- `supabase/functions/_shared/orsRoute.ts` reads an optional `via` list, at most five points. A missing list means none. More than five, or a point that is not a coordinate pair, is refused with "Choose up to five points on the route." The message does not echo a coordinate.
- `buildDirectionsBody` inserts those points between the start and the destination. A loop with any via-point is `[start, ...points, start]` and does not send `round_trip`. An A to B line is `[start, ...points, end]`. A call with no via-points is unchanged: a loop still sends `round_trip` of the chosen length, and an A to B line is still the two ends.
- `supabase/functions/outdoor-route/index.ts` reads `via` and passes the same list into the first directions call and into the snap retry. One invocation still counts as one request. The snap retry is not a second count. A redraw that already has via-points does not need the chosen length again.
- The request row is still `insert({ user_id: userId })`. The timestamp is the row's `created_at`. No coordinate is written there.
- The only log line is still `console.error('outdoor-route request failed')`. No coordinate is logged.

## Layout proofs

The first drawings were of the proposal. The build captures are the Find a route screen in the app, at 320 and at 390.

- 390 wide: `route_edit_390.png`
- 320 wide: `route_edit_320.png`
