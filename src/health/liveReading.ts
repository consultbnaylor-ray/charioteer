import { Platform } from 'react-native';

export type LiveReading = {
  bpm: number | null;
  bpmAtMs: number | null;
  activeKcal: number | null;
};

const EMPTY: LiveReading = { bpm: null, bpmAtMs: null, activeKcal: null };

/**
 * Foreground observer only. The Health background-delivery entitlement is not
 * in this build, and this module does not turn background delivery on.
 * Readings stay in memory for the open session. They are not stored or sent.
 */
export async function watchLiveReading(
  startedAtMs: number,
  includeEnergy: boolean,
  onUpdate: (reading: LiveReading) => void,
): Promise<() => void> {
  if (Platform.OS !== 'ios') {
    onUpdate(EMPTY);
    return () => undefined;
  }
  const mod = await import('./liveReading.ios');
  return mod.watchLiveReading(startedAtMs, includeEnergy, onUpdate);
}
