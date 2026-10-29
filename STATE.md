# State

Current build: 85. Head `3cbf1b9`. Delivery `11b8ea2b-238b-4f14-942d-f5129dcab5a3`.

All new user-facing wording needs Ben's approval in his own words.

## Open pull requests

- #64 own distance and time. Strings not approved.
- #66 loop length. Strings not approved.
- #67 directions to the start. Strings not approved.
- #70 sleep bands. On hold.
- #73 coach note. Not deployed. Wording not approved.
- This pull request. Start live session is hidden for launch.

## Hidden for launch

- Voice. `VOICE_ENABLED` is false in `src/domain/voiceFlag.ts`.
- Live session. `LIVE_SESSION_ENABLED` is false in `src/domain/liveSessionFlag.ts`. The Workouts button stays in the code and is not shown. Opening `/gym-session` returns to Workouts.
