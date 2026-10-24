import type { StatsTone } from '@/domain/statsOverview';
import type { Scheme } from '@/ui/theme';

/** Soft colours for Stats tiles and the nutrition charts. The rest of the app stays monochrome. */
export type StatsInk = { bg: string; ink: string };

/**
 * Ink on the soft fill is at least 4.5:1. Green is on track, orange is watch,
 * blue is a note, and red is needs attention. Red stays rare on this screen.
 * This ink is for words and tile figures. The card edge, ring, and tick use
 * cardAccent, so a pale border can stay separate from text that has to stay readable.
 * Both are fully opaque.
 */
export function statsToneColors(scheme: Scheme): Record<StatsTone, StatsInk> {
  if (scheme === 'dark') {
    return {
      good: { bg: '#143024', ink: '#2DE0A0' },
      watch: { bg: '#3A2A14', ink: '#FFEDD5' },
      info: { bg: '#12263A', ink: '#E0F2FE' },
      attention: { bg: '#3A1818', ink: '#FEE2E2' },
    };
  }
  return {
    good: { bg: '#E7F5EC', ink: '#047857' },
    watch: { bg: '#FFF4E5', ink: '#7C2D12' },
    info: { bg: '#E8F1FA', ink: '#1E3A5F' },
    attention: { bg: '#FDECEC', ink: '#7F1D1D' },
  };
}

/**
 * Decorative edge for cards, the sober ring, and the On-track tick.
 * Kept apart from the text ink. The committed shade is still B until a paler mint is chosen.
 */
export function cardAccent(scheme: Scheme): string {
  if (scheme === 'dark') return '#2DE0A0';
  return '#047857';
}
