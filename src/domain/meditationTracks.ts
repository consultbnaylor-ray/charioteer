/**
 * Meditation music: the bundled track list and the pure timing for looping and fading.
 * Tracks are short files that loop at runtime, so a 10 minute or nonstop listen
 * never needs a longer file in the app. Add a track by dropping an .m4a into
 * assets/audio/meditation/, adding a row here, and adding its `require` in
 * src/audio/meditationSources.ts.
 */

export type MeditationTrack = {
  id: string;
  /** Shown on the buttons. Rename freely; the id stays the same. */
  title: string;
  /** File name under assets/audio/meditation/. */
  file: string;
  /** Length of one pass of the file, before it loops. */
  durationMs: number;
};

export const MEDITATION_TRACKS: readonly MeditationTrack[] = [
  // Suno-made, supplied by Ben on 27 Nov 2026. Working title, rename when Ben picks one.
  { id: 'calm-waters', title: 'Calm Waters', file: 'calm-waters.m4a', durationMs: 300_600 },
];

export type MusicChoice = 'off' | MeditationTrack['id'];
export const MUSIC_OFF: MusicChoice = 'off';

export function findTrack(id: string | null | undefined): MeditationTrack | null {
  if (!id) return null;
  return MEDITATION_TRACKS.find((track) => track.id === id) ?? null;
}

/** Big buttons for the Music choice inside a breathing exercise: Off, then every track. */
export function musicChoices(): { id: MusicChoice; label: string }[] {
  return [{ id: MUSIC_OFF, label: 'Off' }, ...MEDITATION_TRACKS.map((track) => ({ id: track.id, label: track.title }))];
}

export type ListenLength = 'ten' | 'loop';
export const LISTEN_TEN_MINUTES_MS = 10 * 60_000;
export const LISTEN_LENGTHS: readonly { id: ListenLength; label: string; ms: number | null }[] = [
  { id: 'ten', label: '10 minutes', ms: LISTEN_TEN_MINUTES_MS },
  { id: 'loop', label: 'Continuous loop', ms: null },
];
export const DEFAULT_LISTEN_LENGTH: ListenLength = 'ten';

export function listenLengthMs(length: ListenLength): number | null {
  return LISTEN_LENGTHS.find((item) => item.id === length)?.ms ?? null;
}

/** Music sits under the breathing cues, so it never plays at full volume. */
export const MUSIC_VOLUME = 0.8;
export const MUSIC_FADE_IN_MS = 3_000;
/** The fade at the end of a 10 minute listen. */
export const MUSIC_END_FADE_MS = 10_000;
/** The fade when a breathing exercise finishes on its own. */
export const MUSIC_DONE_FADE_MS = 5_000;
/** The fade when the user taps Stop. */
export const MUSIC_STOP_FADE_MS = 1_500;

/**
 * Volume at a point in the listen.
 * Fades in from silence at the start. With an end, fades to silence over the last
 * `endFadeMs` and is 0 from the end onwards. With no end, it holds after the fade-in.
 */
export function musicVolumeAt(
  elapsed: number,
  endMs: number | null,
  options: { volume?: number; fadeInMs?: number; endFadeMs?: number } = {},
): number {
  const volume = options.volume ?? MUSIC_VOLUME;
  const fadeIn = options.fadeInMs ?? MUSIC_FADE_IN_MS;
  const endFade = options.endFadeMs ?? MUSIC_END_FADE_MS;
  const at = Math.max(0, elapsed);
  let gain = fadeIn > 0 ? Math.min(1, at / fadeIn) : 1;
  if (endMs != null) {
    if (at >= endMs) return 0;
    const left = endMs - at;
    if (endFade > 0 && left < endFade) gain = Math.min(gain, left / endFade);
  }
  return round3(volume * gain);
}

/** Volume during a fade-out that began at `fromVolume`, `sinceMs` ago. Reaches 0 at `fadeMs`. */
export function fadeOutVolume(fromVolume: number, sinceMs: number, fadeMs: number): number {
  if (fadeMs <= 0 || sinceMs >= fadeMs) return 0;
  return round3(Math.max(0, fromVolume * (1 - Math.max(0, sinceMs) / fadeMs)));
}

export function isListenOver(elapsed: number, endMs: number | null): boolean {
  return endMs != null && elapsed >= endMs;
}

/** How many times the file plays, start to finish or in part, over a listen. Null when nonstop. */
export function passesFor(track: MeditationTrack, endMs: number | null): number | null {
  if (endMs == null) return null;
  if (track.durationMs <= 0) return 0;
  return Math.ceil(endMs / track.durationMs);
}

/** "7:32 left" style clock for the listen card. */
export function minutesSecondsText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
