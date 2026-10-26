# App Store notes for build 74

Draft for the review notes field. Not submitted. Build 74 is not shipped. The iOS build number in `app.json` stays 72 until the ship process bumps it.

## What to tell App Review

Charioteer uses location while a person is on a walk, run, or cycle they start, including when the screen is locked or another app is open. The permission is While Using the App. There is no Always prompt and no Always purpose string. A blue location mark stays visible while measuring is on.

Measuring starts only from Start on that screen. It stops when they tap Stop, when they discard the outing, when the app is closed, and at a time limit. The limit in this build is six hours. Ben confirmed that length on 26 October 2026.

The route of the outing stays on the phone in memory. It is not uploaded. A route is sent to the route service only if the person turns route finding on, and that request is the start and the destination, not the outing path.

The `audio` background mode is for a short spoken line during that outing. The line is text already on the phone. Nothing is recorded. The microphone is not used. Speech is not started in this build until a phone check shows music ducks and then returns to full volume, with no leftover session. On screen only does not start an audio session. There is no silent audio.

Heart rate shown during an outing or a gym session is read from Apple Health while the app is in front. Background delivery is not enabled. The number stays on the phone.

## How to test

1. Open Outside is Good and tap Start a walk.
2. Read the explanation on the setup screen before tapping Start.
3. Tap Start. The system prompt is While Using. There is no Always choice.
4. Allow it. The map is on the screen and the line grows as you move.
5. Lock the phone. The blue location mark should remain. Measuring should continue.
6. Unlock, and tap Stop. The mark should go away. The summary is distance, time, and pace. The path is gone.

Spoken audio is not part of this test until the phone check below is recorded. Until then the line is on the screen only, even if Spoken and on screen was chosen.

## Demo video script

Film this on a phone before ship. The script is also the gate for speech.

1. Start a walk from Outside is Good.
2. Show the in-app explanation before the system prompt.
3. Show the While Using prompt. Show that Always is not offered.
4. Lock the phone.
5. Show the blue location indicator.
6. One spoken line, with music already playing. The music should dip, then return to full volume. There should be no leftover session. Repeat once during a phone call, and once with Bluetooth headphones.
7. Stop. Show that the indicator is gone.

If step 6 fails, leave `SPEECH_OVER_MUSIC_GATE_PASSED` false and do not ship the spoken path.

## Nutrition label

Do not fill the nutrition label from this commit. After the final binary is archived:

- Proxy the phone and confirm no request carries the outing coordinates.
- Grep logs for coordinate console output. This repo's outing code does not log them.
- Then Precise Location can be linked to the user, used for app functionality, and not used for tracking.

Heart rate from the live session is not a new data type sent off the phone. It is not in the export.
