/**
 * Bundled meditation tracks, keyed by the id in src/domain/meditationTracks.ts.
 * Kept apart from the domain list so tests can read the list without Metro.
 */
export const MEDITATION_SOURCES: Record<string, number> = {
  'calm-waters': require('../../assets/audio/meditation/calm-waters.m4a'),
};
