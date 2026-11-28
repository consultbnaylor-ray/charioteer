/**
 * Bundled meditation tracks, keyed by the id in src/domain/meditationTracks.ts.
 * Kept apart from the domain list so tests can read the list without Metro.
 */
export const MEDITATION_SOURCES: Record<string, number> = {
  'tribal-warrior': require('../../assets/audio/meditation/tribal-warrior.m4a'),
};
