/**
 * One set of training words for the weekly plan, the stat cards, and Thumos.
 * Intervals are the main way to raise VO2 max. Easy Zone 2 is the base and recovery.
 * Resting heart rate, sleep, and steps keep their own advice, so those cards do not
 * get the VO2 session and the VO2 session does not get their job.
 */

export const VO2_INTERVAL_SESSION =
  'four repeats of four minutes at about 85 to 95 percent of max heart rate, with three easy minutes between, once or twice a week';

export const VO2_SOURCE = 'Helgerud and colleagues, 2007';

export const VO2_MAIN_TIP =
  `The main lever for VO2 max is intervals: ${VO2_INTERVAL_SESSION} (${VO2_SOURCE}).`;

export const VO2_VIGOROUS_TIP =
  'Vigorous minutes add to the same lever. Aim for 75 or more a week, for example two interval sessions.';

export const VO2_ZONE2_TIP =
  'Easy Zone 2 is the base and recovery around those sessions, not the main way to raise VO2 max.';

export const VO2_CARD_TIPS = [VO2_MAIN_TIP, VO2_VIGOROUS_TIP, VO2_ZONE2_TIP] as const;

/** What Thumos is told when VO2 max is short of the saved goal. */
export const VO2_ANALYSIS_RULE =
  `When VO2 max has a goalGap, the main lever is ${VO2_INTERVAL_SESSION} (${VO2_SOURCE}). Vigorous minutes support that. Easy Zone 2 is only the base and recovery, not the main way to raise VO2 max. A gain of a few ml/kg/min over months is realistic. VO2 max is the main input to fitness age.`;

/** Focus item and fitness-snapshot line when VO2 max is under the goal or the age band. */
export const VO2_FOCUS_LINE =
  'Add one or two interval sessions a week for VO2 max: 4×4 min at about 85–95% max heart rate, with 3 min easy between.';

export const VO2_CONTEXT_LINE =
  'Intervals at about 85 to 95 percent of max heart rate are the main lever. Zone 2 is the base and recovery, not the main lever. Not a running plan.';

export const ZONE2_BESIDE_WORK =
  'Keep an easy Zone 2 day as the base and recovery. It is not the main way to raise VO2 max.';

export const LOW_CARDIO_CONTEXT_LINE =
  'Easy Zone 2 is the aerobic base beside the sessions you already do. It is not the main way to raise VO2 max. Not a running plan.';

export const RESTING_AEROBIC_TIP =
  'Easy aerobic sessions and walks, most weeks, are what usually brings a high resting rate down.';

export const SLEEP_WAKE_TIP = 'Keep a steady wake time, including after a late night.';

export const SLEEP_TIPS = [
  SLEEP_WAKE_TIP,
  'Dim screens in the hour before bed.',
  'Leave caffeine for earlier in the day, and go easy on alcohol in the evening.',
] as const;

export const STEP_UNDER_60_LOW = 8000;
export const STEP_60_LOW = 6000;
export const STEP_AGE_UNKNOWN_LOW = 7000;

export const STEP_WALK_TIP = 'A short walk after meals adds steps without a formal session.';

export const STEP_TIPS = [
  STEP_WALK_TIP,
  'Break up long sitting with a few minutes on your feet.',
  'Build toward the research range for your age a little at a time.',
] as const;

export function stepRangeLow(age: number | null): number {
  if (age != null && age >= 60) return STEP_60_LOW;
  if (age != null && age < 60) return STEP_UNDER_60_LOW;
  return STEP_AGE_UNKNOWN_LOW;
}

export function stepsLookLow(steps: number | null, age: number | null): boolean {
  if (steps == null || !(steps > 0)) return false;
  return steps < stepRangeLow(age);
}

/** One reason for an interval day. Names VO2 when that is the gap. */
export function intervalDayReason(input: {
  vo2Short: boolean;
  reference: string | null;
  belowAge: boolean;
  trending: boolean;
  protocol: boolean;
}): string {
  if (!input.vo2Short) {
    return input.trending
      ? 'Cardio fitness is trending down, so this is the vigorous day.'
      : 'One vigorous interval session this week, beside the work you already do.';
  }
  if (input.trending && input.reference) {
    return `VO2 max is below the ${input.reference} reference and trending down, so these intervals are the main lever.`;
  }
  if (input.trending) return 'VO2 max is trending down, so these intervals are the main lever.';
  if (input.protocol) return '4×4 min at about 85–95% max heart rate, with 3 min easy between, once or twice a week.';
  if (input.reference) return `VO2 max is below the ${input.reference} reference, so these intervals are the main lever.`;
  if (input.belowAge) return 'VO2 max is under the usual range for your age and sex, so these intervals are the main lever.';
  return 'These intervals are the main lever for VO2 max.';
}

/** Zone 2 is recovery or base. It does not claim to close a VO2 gap. A high resting rate uses the same words as that card. */
export function zone2DayReason(input: { restingHigh: boolean; lowCardio: boolean }): string {
  if (input.restingHigh) return RESTING_AEROBIC_TIP;
  if (input.lowCardio) return 'Cardio is a small share of these minutes. This easy day is the base and recovery.';
  return 'This easy day is the aerobic base and recovery.';
}
