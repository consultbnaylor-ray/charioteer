# Store privacy labels for location

Notes for the App Store privacy questionnaire and the Google Play Data safety form. They are not submitted. Confirm them in each console before build 70 is uploaded.

## Apple App Store

Add one data type for this feature:

- Precise Location
- Linked to the user
- Used for app functionality
- Not used for tracking
- Not used for third-party advertising

The purpose string on the device is while-in-use only: `NSLocationWhenInUseUsageDescription`. Do not add `NSLocationAlwaysAndWhenInUseUsageDescription` or `NSLocationAlwaysUsageDescription`.

`NSMotionUsageDescription` is present only to satisfy Apple's static check. The sentence is: "Charioteer does not use your motion or fitness data. The map component in the app can reference motion sensors, so Apple requires this note." The app never reads motion or fitness-activity data. Do not add a Fitness or Motion data type. Do not turn on Android motion activity.

The calendar purpose string from build 68 stays. This feature does not add a photo purpose string.

## Google Play

Declare location as approximate and precise, collected, for app functionality. It is not shared with other people, not used for tracking, and not used for ads. When route finding is on, the start point and the destination are sent to HeiGIT (OpenRouteService) to make the route. That is a service provider for app functionality. Route finding is off until the person turns it on, and the choice stays on the phone. The permissions requested for this feature are foreground only:

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`

Do not declare background location. Do not add `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, or `FOREGROUND_SERVICE_LOCATION` in the app config. The expo-location library manifest still names a location task service. The app does not start it. Say so if Play asks about that service, and do not turn the foreground-service permission on to satisfy the question.

## OpenFreeMap

Tile requests leave the phone while the map is open. If a form asks about map data sent to a service provider, name OpenFreeMap (and Cloudflare, which their terms say they may use) as the map host. The saved route itself is not sent to them.

When route finding is on, also name HeiGIT (OpenRouteService, host api.heigit.org) as the service that receives the start point and the destination. The route-service key is not in the app. HeiGIT's privacy policy (April 2022) does not publish a fixed number of days for how long a request is kept. Do not add a new permission for this.
