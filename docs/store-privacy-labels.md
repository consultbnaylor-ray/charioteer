# Store privacy labels for location

Notes for the App Store privacy questionnaire and the Google Play Data safety form. They are not submitted. Confirm them in each console before build 69 is uploaded.

## Apple App Store

Add one data type for this feature:

- Precise Location
- Linked to the user
- Used for app functionality
- Not used for tracking
- Not used for third-party advertising

The purpose string on the device is while-in-use only: `NSLocationWhenInUseUsageDescription`. Do not add `NSLocationAlwaysAndWhenInUseUsageDescription` or `NSLocationAlwaysUsageDescription`. Do not add a motion purpose string for this feature.

The calendar purpose string from build 68 stays. This feature does not add a photo purpose string.

## Google Play

Declare location as approximate and precise, collected, not shared, for app functionality. The permissions requested for this feature are foreground only:

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`

Do not declare background location. Do not add `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, or `FOREGROUND_SERVICE_LOCATION` in the app config. The expo-location library manifest still names a location task service. The app does not start it. Say so if Play asks about that service, and do not turn the foreground-service permission on to satisfy the question.

## OpenFreeMap

Tile requests leave the phone while the map is open. If a form asks about map data sent to a service provider, name OpenFreeMap (and Cloudflare, which their terms say they may use) as the map host. The saved route itself is not sent to them.
