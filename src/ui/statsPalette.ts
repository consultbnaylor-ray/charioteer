import type { StatsTone } from '@/domain/statsOverview';
import type { Scheme } from '@/ui/theme';

/** Soft colours for the Stats tiles only. The rest of the app stays monochrome. */
export type StatsInk = { bg: string; ink: string };

/**
 * Ink on the soft fill is at least 4.5:1. Green is on track, orange is watch,
 * blue is a note, and red is needs attention. Red stays rare on this screen.
 */
export function statsToneColors(scheme: Scheme): Record<StatsTone, StatsInk> {
  if (scheme === 'dark') {
    return {
      good: { bg: '#143024', ink: '#D1FAE5' },
      watch: { bg: '#3A2A14', ink: '#FFEDD5' },
      info: { bg: '#12263A', ink: '#E0F2FE' },
      attention: { bg: '#3A1818', ink: '#FEE2E2' },
    };
  }
  return {
    good: { bg: '#E7F5EC', ink: '#14532D' },
    watch: { bg: '#FFF4E5', ink: '#7C2D12' },
    info: { bg: '#E8F1FA', ink: '#1E3A5F' },
    attention: { bg: '#FDECEC', ink: '#7F1D1D' },
  };
}
