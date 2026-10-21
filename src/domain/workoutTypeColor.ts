/**
 * Okabe–Ito colours for workout series (Wong, Nature Methods, 2011).
 * The same colour is used for a type on every chart and legend.
 * Other is a neutral grey. Colour is only used here, to tell series apart.
 */
export const WORKOUT_TYPE_COLOR = {
  Walking: '#56B4E9',
  'Functional strength': '#E69F00',
  'Traditional strength': '#0072B2',
  Elliptical: '#009E73',
  Running: '#D55E00',
  Boxing: '#CC79A7',
  Rowing: '#F0E442',
} as const;

/** Visible on the dark card. Not one of the series colours above. */
export const WORKOUT_TYPE_OTHER_COLOR = '#8A8A84';

/** Further types that show up often. Still one fixed colour, outside the named set. */
const FURTHER_TYPE_COLOR: Record<string, string> = {
  Cycling: '#332288',
  Hiking: '#882255',
  Swimming: '#117733',
  Yoga: '#AA4499',
  HIIT: '#44AA99',
  'Mixed cardio': '#CC6677',
  'Core training': '#661100',
  Kickboxing: '#88CCEE',
};

const EXTRA_TYPE_COLOR = Object.values(FURTHER_TYPE_COLOR);

export type NamedWorkoutType = keyof typeof WORKOUT_TYPE_COLOR;

/** One fixed colour for this workout type. The same label always returns the same colour. */
export function workoutTypeColor(label: string): string {
  const named = WORKOUT_TYPE_COLOR[label as NamedWorkoutType];
  if (named) return named;
  const further = FURTHER_TYPE_COLOR[label];
  if (further) return further;
  if (label === 'Other') return WORKOUT_TYPE_OTHER_COLOR;
  let hash = 2166136261;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return EXTRA_TYPE_COLOR[(hash >>> 0) % EXTRA_TYPE_COLOR.length] ?? WORKOUT_TYPE_OTHER_COLOR;
}
