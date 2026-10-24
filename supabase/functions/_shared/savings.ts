const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type Savings = {
  moneyGbp: number;
  units: number;
  weeks: number;
};

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Pro-rata the person's own typical week. Never a guessed national average. */
export function savingsFromTypicalWeek(
  weeklySpendGbp: number,
  weeklyUnits: number,
  soberMs: number,
): Savings {
  const weeks = Math.max(0, soberMs) / WEEK_MS;
  const spend = Math.max(0, weeklySpendGbp);
  const units = Math.max(0, weeklyUnits);
  return {
    weeks: round(weeks, 4),
    moneyGbp: round(spend * weeks, 2),
    units: round(units * weeks, 1),
  };
}

/**
 * The NHS yearly lager example is 5 pints × 222 kcal × 52 weeks = 57,720 kcal.
 * https://www.nhs.uk/live-well/alcohol-advice/calories-in-alcohol/
 */
export const NHS_WEEKS_IN_YEAR = 52;

/** A full year of a typical week. Same rounding as the sober-date savings. */
export function yearlyFromWeekly(weekly: number, places: number): number {
  if (!Number.isFinite(weekly) || weekly < 0) return 0;
  return round(weekly * NHS_WEEKS_IN_YEAR, places);
}

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}
