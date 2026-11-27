# Meditation music: source and licensing

## Tracks in the app

| id | Title (working) | File | Length | Source |
| --- | --- | --- | --- | --- |
| `calm-waters` | Calm Waters | `assets/audio/meditation/calm-waters.m4a` | 5:00.6 | Made by Ben in Suno, supplied 27 Nov 2026 (Suno id `ae82f4db-dd3c-46ef-9193-6b1f7606b9b7`, created 2026-11-27 22:12 GMT) |

"Calm Waters" is a working title. The Suno file carried no title, only "made with suno". Ben can rename it by changing `title` in `src/domain/meditationTracks.ts`; the id and file stay the same.

## Licence condition — Ben must confirm before App Store submission

- Suno only grants commercial use (including use inside an app sold or offered on the App Store, and in-app subscriptions) for songs **made while on a paid Suno plan** (Pro or Premier). Songs made on the free plan are for non-commercial use only, and upgrading later does not cover songs made before the upgrade.
- Charioteer is a commercial app with paid tiers, so every bundled track must have been generated on a paid plan.
- **Ben to confirm:** `calm-waters` was generated while his Suno account was on a paid plan. If it was not, regenerate it on a paid plan before release, or remove it from `MEDITATION_TRACKS`.
- Keep the Suno song id above as the record. Re-check Suno's current terms at submission time, as they can change.

## How the file was prepared (27 Nov 2026)

From the 48 kHz stereo WAV (55 MB, 5:01.2): trimmed the 0.54 s of silence at the start, lowered the level by 5 dB (integrated loudness −12.9 → −18 LUFS, so it sits under the breathing cues), added a 0.5 s safety fade at each end, and encoded AAC 112 kbps stereo 48 kHz in an .m4a with no metadata other than the title. Result: 4.35 MB, 5:00.6.

The track already fades in over its first 5 s and out over its last 6 s, so the loop point is quiet and a tiny gap from the player looping is not heard. The app loops the file at runtime for 10 minutes, the length of a breathing exercise, or nonstop. No longer file is baked.

## Adding another track

1. Encode to `.m4a` AAC 96–128 kbps stereo, under 5 MB, into `assets/audio/meditation/`.
2. Add a row to `MEDITATION_TRACKS` in `src/domain/meditationTracks.ts` (id, title, file, durationMs).
3. Add its `require` to `src/audio/meditationSources.ts` under the same id.
4. Add a row to the table above with its source and licence status.

## Privacy

Music is bundled inside the app and plays offline. Nothing is downloaded, sent or recorded, so there is no change to the privacy policy or the App Store privacy labels.
