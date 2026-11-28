/**
 * Plain explanations for the Activity charts on Workouts.
 * A chart in this list is drawn only when it has explanation text.
 */

const HOW_TO_READ =
  'Latest is the newest point on the line, and Min and Max are the lowest and highest in this range.';

function explain(what: string, source: string): string {
  return `${what} ${source} ${HOW_TO_READ}`;
}

export const ACTIVITY_CHART_DEFINITIONS = [
  {
    id: 'steps',
    title: 'Steps',
    unit: 'steps',
    explanation: explain(
      'Steps are how many steps you took that day.',
      'Garmin is used when it has the higher total, and Apple Health is used when Garmin is missing or lower.',
    ),
  },
  {
    id: 'exercise',
    title: 'Exercise minutes',
    unit: 'min',
    explanation: explain(
      'Exercise minutes are the movement time stored for that day.',
      'Apple Health is used when that day is above zero, in plain minutes, and Garmin is used when Apple has none, with each vigorous minute counted twice.',
    ),
  },
  {
    id: 'moderate',
    title: 'Moderate minutes',
    unit: 'min',
    explanation: explain(
      'Moderate minutes are Garmin\'s moderate movement, one minute for one minute.',
      'Apple Health does not split moderate and vigorous, so this line is Garmin only.',
    ),
  },
  {
    id: 'distance',
    title: 'Distance',
    unit: 'm',
    explanation: explain(
      'Distance is how far you moved that day, taken from Garmin.',
      'Apple Health distance is not mixed into this line.',
    ),
  },
  {
    id: 'active_calories',
    title: 'Active calories',
    unit: 'kcal',
    explanation: explain(
      'Active calories are the energy your movement used that day.',
      'Apple Health is used when that day is above zero, and Garmin fills the day when Apple has none, without adding the two.',
    ),
  },
  {
    id: 'resting_heart_rate',
    title: 'Resting heart rate',
    unit: 'bpm',
    explanation: explain(
      'Resting heart rate is the beats per minute stored for that day.',
      'Garmin is used first, and Apple Health is the fallback when Garmin has no reading.',
    ),
  },
] as const;

export type ActivityChartId = (typeof ACTIVITY_CHART_DEFINITIONS)[number]['id'];
