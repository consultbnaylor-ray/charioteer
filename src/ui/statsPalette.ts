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

const CHART_ROLE: Record<string, GridRole> = {
  Steps: 'activity',
  'Exercise minutes': 'activity',
  'Moderate minutes': 'activity',
  'Intensity minutes': 'activity',
  'Workout minutes': 'activity',
  Workouts: 'mind',
  Floors: 'activity',
  'VO2 max': 'activity',
  'Breathing rate': 'activity',
  'Blood oxygen': 'activity',
  'Pulse ox': 'activity',
  Epochs: 'activity',
  'Move IQ': 'activity',
  'Activity detail': 'activity',
  Distance: 'sobriety',
  'Body battery charged': 'sobriety',
  'Body battery highest': 'sobriety',
  'Resting heart rate': 'heart',
  'Walking heart rate': 'heart',
  'Health snapshot': 'heart',
  'Blood pressure': 'heart',
  'Diastolic pressure': 'heart',
  'Heart rate variability': 'mind',
  'Heart rate variability (Garmin overnight RMSSD)': 'mind',
  'Average stress': 'mind',
  'Sleep score': 'mind',
  'Sleep duration': 'mind',
  'Fitness age': 'mind',
  Mood: 'mind',
  'Active calories': 'food',
  Calories: 'food',
  Protein: 'food',
  'Body composition': 'food',
  BMI: 'food',
  Weight: 'food',
  'Vigorous minutes': 'warning',
  'Skin temperature': 'warning',
  'Body battery drained': 'warning',
  'Body battery lowest': 'warning',
  Craving: 'warning',
};

/** Which accent a chart title uses. The line and the bars share it. Unknown titles stay on the ink. */
export function chartAccent(title: string, scheme: Scheme): string | null {
  const role = CHART_ROLE[title];
  return role ? gridAccents(scheme)[role] : null;
}

/**
 * One colour per nutrition bar. Dark values sit on the card surface (#1A1A1A) at
 * more than 4.5:1 so a value or chip can use them. Light values are the darker
 * pair, for the same reason on white. They stay inside the neon palette:
 * amber, mint, cyan, pink, gold, rose, lime, violet, teal.
 */
export type MacroKey = 'kcal' | 'protein' | 'carbs' | 'sugar' | 'fat' | 'saturated' | 'fibre' | 'salt' | 'processed';

const MACRO_DARK: Record<MacroKey, string> = {
  kcal: '#F59E0B',
  protein: '#2DE0A0',
  carbs: '#36D6FF',
  sugar: '#F472B6',
  fat: '#FDE047',
  saturated: '#FB7185',
  fibre: '#A3E635',
  salt: '#C4B5FD',
  processed: '#5EEAD4',
};

const MACRO_LIGHT: Record<MacroKey, string> = {
  kcal: '#C2410C',
  protein: '#047857',
  carbs: '#0369A1',
  sugar: '#BE185D',
  fat: '#A16207',
  saturated: '#BE123C',
  fibre: '#4D7C0F',
  salt: '#6D28D9',
  processed: '#0F766E',
};

/** Macro identity colour. Null when this bar has no named macro. */
export function macroAccent(key: string, scheme: Scheme): string | null {
  const ink = scheme === 'dark' ? MACRO_DARK : MACRO_LIGHT;
  return key in ink ? ink[key as MacroKey] : null;
}

/** Green while a limit holds, amber once it is passed. No red step: these guides have no far-over line. */
export function limitStatusInk(status: 'within' | 'above', scheme: Scheme): string {
  if (status === 'within') return scheme === 'dark' ? '#2DE0A0' : '#047857';
  return watchSignalInk(scheme);
}
