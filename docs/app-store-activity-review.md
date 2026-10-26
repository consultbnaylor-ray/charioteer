# App Store notes for build 74

Draft for the review notes field. Not submitted. Build 74 is not shipped. The iOS build number in `app.json` stays 72 until the ship process bumps it.

## What to tell App Review

Charioteer uses location while a person is on a walk, run, or cycle they start, including when the screen is locked or another app is open. The permission is While Using the App. There is no Always prompt and no Always purpose string. A blue location mark stays visible while measuring is on.

Measuring starts only from Start on that screen. It stops when they tap Stop, when they discard the outing, when the app is closed, and at a time limit. The limit in this build is six hours. Ben confirmed that length on 26 October 2026.

The route of the outing stays on the phone in memory. It is not uploaded. A route is sent to the route service only if the person turns route finding on, and that request is the start and the destination, not the outing path.

The `audio` background mode is used only for Thumos spoken lines when the person picks spoken updates. The line is text already on the phone. Nothing is recorded. The microphone is not used. On screen only does not start an audio session. There is no silent audio. TestFlight speaks those lines. App Store submission is blocked until a real phone shows music ducks, then returns to full volume after each line, with no leftover audio session, including a phone call and Bluetooth headphones. `EXPO_PUBLIC_BUILD_PROFILE=store` keeps speech off and leaves `audio` out of `UIBackgroundModes` until that gate is true. Build 74 for TestFlight testing keeps audio and speech on.

External TestFlight groups go through Beta App Review. Guideline 2.5.4 applies to that review. Internal testers do not go through Beta App Review.

Heart rate shown during an outing or a gym session is read from Apple Health while the app is in front. It is not read while the phone is locked. Background delivery is not enabled. The number stays on the phone. Ben re-approved that wording on 26 October 2026.

## How to test

1. Open Outside is Good and tap Start a walk.
2. Read the explanation on the setup screen before tapping Start.
3. Tap Start. The system prompt is While Using. There is no Always choice.
4. Allow it. The map is on the screen and the line grows as you move.
5. Lock the phone. The blue location mark should remain. Measuring should continue.
6. Unlock, and tap Stop. The mark should go away. The summary is distance, time, and pace. The path is gone.

Spoken audio is on for TestFlight when Spoken and on screen is chosen. The App Store gate below is still required. On screen only must not start an audio session.

## Demo video script

Film this on a phone before ship. The script is also the gate for speech.

1. Start a walk from Outside is Good.
2. Show the in-app explanation before the system prompt.
3. Show the While Using prompt. Show that Always is not offered.
4. Lock the phone.
5. Show the blue location indicator.
6. One spoken line, with music already playing. The music should dip, then return to full volume. There should be no leftover session. Repeat once during a phone call, and once with Bluetooth headphones.
7. Stop. Show that the indicator is gone.

Hard release gate: App Store submission is blocked until a real phone shows music ducks, then returns to full volume after each line, with no leftover audio session, including a phone call and Bluetooth headphones. If step 6 fails, leave `APP_STORE_SPEECH_DUCK_GATE_PASSED` false. Do not submit to the App Store. On screen only never starts an audio session. There is no silent keepalive.

## Nutrition label

Do not fill the nutrition label from this commit. After the final binary is archived:

- Proxy the phone. The packet check includes tile requests. A tile request can show the approximate area. Confirm no non-tile request carries the outing coordinates.
- Grep logs for coordinate console output. This repo's outing code does not log them.
- Fill the sheet slot in this form: proxy check done on build X, no coordinates in non-tile requests.
- Then Precise Location can be linked to the user, used for app functionality, and not used for tracking. The nutrition label stays open until that result is filled.

Heart rate from the live session is not a new data type sent off the phone. It is not in the export.
