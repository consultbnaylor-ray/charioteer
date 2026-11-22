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

/** Pale mint edge for cards, the sober ring, and the On-track tick. Fully opaque, and separate from the text ink. */
export function cardAccent(scheme: Scheme): string {
  if (scheme === 'dark') return '#D1FAE5';
  return '#6EE7B7';
}

/**
 * Saturated amber for the calorie second lap.
 * Dark-mode watch ink is #FFEDD5 so small text stays readable.
 * That peach disappears on the mint ring. The stroke uses one amber in both schemes.
 */
export function watchArcInk(scheme: Scheme): string {
  return scheme === 'dark' ? '#F59E0B' : '#F59E0B';
}

/**
 * Amber for the Watch word beside an over-target calorie ring.
 * Dark cards can take the same amber as the second lap. Light cards need a
 * darker amber so the word still clears the white surface.
 */
export function watchSignalInk(scheme: Scheme): string {
  return scheme === 'dark' ? '#F59E0B' : '#C2410C';
}

/** Lime wash for a published good zone on a bar. Empty bars stay on the hairline colour. */
export function goodZoneBand(scheme: Scheme): string {
  if (scheme === 'dark') return 'rgba(45, 224, 160, 0.45)';
  return 'rgba(132, 204, 22, 0.55)';
}

/**
 * Grid Runner accents. Each colour means one thing.
 * Dark values are the neon strokes. Light values are darker so small text
 * still clears 4.5:1 on white. Heart stays a stroke, never an SOS fill.
 */
export type GridRole = 'sobriety' | 'activity' | 'heart' | 'food' | 'mind' | 'warning' | 'edge';

export type GridAccents = Record<GridRole, string>;

export function gridAccents(scheme: Scheme): GridAccents {
  if (scheme === 'dark') {
    return {
      sobriety: '#2DE0A0',
      activity: '#36D6FF',
      heart: '#FF4D6D',
      food: '#F59E0B',
      mind: '#9B8CFF',
      warning: '#FFE14A',
      edge: '#D1FAE5',
    };
  }
  return {
    sobriety: '#047857',
    activity: '#0369A1',
    heart: '#BE123C',
    food: '#C2410C',
    mind: '#5B21B6',
    warning: '#A16207',
    edge: '#047857',
  };
}

/** Faint mint grid. Light mode uses the darker sobriety ink at the same low opacity. */
export function gridLine(scheme: Scheme): string {
  return scheme === 'dark' ? 'rgba(45, 224, 160, 0.07)' : 'rgba(4, 120, 87, 0.08)';
}

/** Which accent a chart title uses. Unknown titles stay on the existing ink. */
export function chartAccent(title: string, scheme: Scheme): string | null {
  const accents = gridAccents(scheme);
  if (title === 'Resting heart rate' || title === 'Walking heart rate') return accents.heart;
  if (title === 'Heart rate variability') return accents.mind;
  if (title === 'Active calories') return accents.food;
  if (
    title === 'Distance'
    || title === 'Steps'
    || title === 'Exercise minutes'
    || title === 'Moderate minutes'
    || title === 'Vigorous minutes'
    || title === 'Intensity minutes'
    || title === 'Floors'
  ) return accents.activity;
  return null;
}
