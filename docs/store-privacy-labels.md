# Store privacy labels for location

Notes for the App Store privacy questionnaire and the Google Play Data safety form. They are not submitted. Confirm them in each console before build 70 is uploaded.

## Apple App Store

Add one data type for this feature:

- Precise Location
- Linked to the user
- Used for app functionality
- Not used for tracking
- Not used for third-party advertising

The purpose string on the device is while-in-use only: `NSLocationWhenInUseUsageDescription`. Do not add `NSLocationAlwaysAndWhenInUseUsageDescription` or `NSLocationAlwaysUsageDescription`. Approved by Ben on 26 October 2026, in build 74, not shipped: `UIBackgroundModes` entries `location` and `audio`, and the while-using sentence that says measuring can continue when the screen is locked or another app is open. Always strings stay absent. Significant-change and region monitoring are not used. The outing path stays in memory until Stop or discard, is lost if the app is killed, and the outing path is not sent. It is not logged or added to the data export or to sobriety logs. No live-tracking route is sent to HeiGIT. Heart rate from the outing or gym session stays on the phone, read-only, and out of the export. Audio is used only for Thumos spoken lines when the person picks spoken updates. Those lines are on-device text to speech from a fixed list. They do not record. On screen only does not start an audio session. There is no silent keepalive. App Store submission is blocked until a real phone shows music ducks, then returns to full volume after each line, with no leftover audio session, including a phone call and Bluetooth headphones.

Do not fill the privacy nutrition label from this note or from this commit. After the final binary is archived, run a proxy and confirm no request carries outing coordinates, and grep for coordinate console logs. Only then fill Precise Location as linked to the user, used for app functionality, and not used for tracking. The review notes and the demo-video script are in `docs/app-store-activity-review.md`. A Garmin broadcast is not in this build. Do not add `NSBluetoothAlwaysUsageDescription` or `UIBackgroundModes` `bluetooth-central`. Garmin Connect is not a source.

`NSMotionUsageDescription` is present only to satisfy Apple's static check. The sentence is: "Charioteer does not use your motion or fitness data. The map component in the app can reference motion sensors, so Apple requires this note." The app never reads motion or fitness-activity data. Do not add a Fitness or Motion data type. Do not turn on Android motion activity.

`NSMicrophoneUsageDescription` stays. The sentence is: "Charioteer does not record audio. Voice is switched off in this version. Apple requires this note because an audio component is included in the app." Voice is switched off. Do not add an Audio data type for a recording. Do not remove the key.

`NSFaceIDUsageDescription` stays. The sentence is: "Charioteer does not use Face ID. Apple requires this note because a component in the app can reference it." Do not add a Face ID or biometric data type. Do not remove the key.

The calendar purpose string from build 68 stays. This feature does not add a photo purpose string.

## Google Play

Declare location as approximate and precise, collected, for app functionality. It is not shared with other people, not used for tracking, and not used for ads. When route finding is on, the start point and the destination are sent to HeiGIT (OpenRouteService) to make the route. That is a service provider for app functionality. Route finding is off until the person turns it on, and the choice stays on the phone. The permissions requested for this feature are foreground only:

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`

Do not declare background location. Do not add `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, or `FOREGROUND_SERVICE_LOCATION` in the app config. The expo-location library manifest still names a location task service. The app does not start it. Say so if Play asks about that service, and do not turn the foreground-service permission on to satisfy the question.

## OpenFreeMap

Tile requests leave the phone while the map is open. In plain words, the map downloads tiles for the area shown from OpenFreeMap, which can reveal the approximate area, not the path or your identity. The packet check includes tile requests. If a form asks about map data sent to a service provider, name OpenFreeMap, operated by Hyperknot Software Kft., and Cloudflare, which their terms (https://openfreemap.org/tos/) say they may use, as the map host. Their privacy policy (https://openfreemap.org/privacy/, last updated 8 October 2026, read 26 October 2026) says access logs omit IP addresses by default and that error logs are deleted after 7 days. The outing path is not sent to them. The light Liberty style and the dark style are both served from tiles.openfreemap.org. The light or dark choice stays on the phone (`charioteer.map-style`). It is not sent. Full screen does not add a host.

When route finding is on, also name HeiGIT gGmbH (OpenRouteService, host api.heigit.org, servers in the EU) as the service that receives the coordinates and the travel type. A place search sends the words typed. The phone's address and the account number are not sent. HeiGIT sees the server's address. The route-service key is not in the app. HeiGIT's transparency statement (https://account.heigit.org/info/transparency-statement) says the full request and response, the IP address, and the API key are kept for 7 days to look for abuse, then deleted, and that, for a route, coordinates rounded to about 1 km plus the request metadata are kept with no end date. A place search is geocoding: the same statement says the typed place is not kept past those 7 days. The statement is voluntary and not a binding promise. Do not add a new permission for this.
