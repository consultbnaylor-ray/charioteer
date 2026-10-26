# Store privacy labels for location

Notes for the App Store privacy questionnaire and the Google Play Data safety form. They are not submitted. Confirm them in each console before build 70 is uploaded.

## Apple App Store

Add one data type for this feature:

- Precise Location
- Linked to the user
- Used for app functionality
- Not used for tracking
- Not used for third-party advertising

The purpose string on the device is while-in-use only: `NSLocationWhenInUseUsageDescription`. Do not add `NSLocationAlwaysAndWhenInUseUsageDescription` or `NSLocationAlwaysUsageDescription`. A walk, run, or cycle uses that same while-in-use location, only while the activity screen is open. The summary stays on the phone. It is not a server collection. The binary has no background location mode and no audio background mode. Spoken lines are on-device text to speech and do not record.

A proposal dated 26 October 2026, tightened the same day by the Security and Compliance Bot, would, after the wording is approved and not before, add `UIBackgroundModes` entries `location` and `audio`, and replace the while-using sentence. It would still not add the Always strings. It would not use significant-change or region monitoring. The path of an outing would stay in memory until Stop or discard, would be lost if the app is killed, and would not be sent, logged, or added to the data export or to sobriety logs. Check the privacy nutrition label against the final binary. Do not fill the store form as if that proposal is already in the binary. If the final binary matches that location proposal, Precise Location stays linked to the user, used for app functionality, and not used for tracking. A later proposal would also show split times, and a heart rate already covered by the Health read, on the phone only. That Apple Watch source would not add a Bluetooth permission. A Garmin broadcast, if it is built after the wording is approved, would add `NSBluetoothAlwaysUsageDescription` and `UIBackgroundModes` `bluetooth-central`. Garmin Connect is not a source. Do not fill the store form from either proposal.

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

Tile requests leave the phone while the map is open. If a form asks about map data sent to a service provider, name OpenFreeMap (and Cloudflare, which their terms say they may use) as the map host. The saved route itself is not sent to them. The light Liberty style and the dark style are both served from tiles.openfreemap.org. The light or dark choice stays on the phone (`charioteer.map-style`). It is not sent. Full screen does not add a host.

When route finding is on, also name HeiGIT gGmbH (OpenRouteService, host api.heigit.org, servers in the EU) as the service that receives the coordinates and the travel type. A place search sends the words typed. The phone's address and the account number are not sent. HeiGIT sees the server's address. The route-service key is not in the app. HeiGIT's transparency statement (https://account.heigit.org/info/transparency-statement) says the full request and response, the IP address, and the API key are kept for 7 days to look for abuse, then deleted, and that, for a route, coordinates rounded to about 1 km plus the request metadata are kept with no end date. A place search is geocoding: the same statement says the typed place is not kept past those 7 days. The statement is voluntary and not a binding promise. Do not add a new permission for this.
