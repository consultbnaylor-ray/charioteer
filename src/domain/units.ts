/**
 * Published NHS drink sizes from
 * https://www.nhs.uk/live-well/alcohol-advice/calculating-alcohol-units/
 * A bottle is stated in the page text as 10 units. The others are the drinks table.
 * The pint of 5.2% lager is 2.95 by the formula; the NHS rounds it to 3.
 *
 * Calories are the published NHS or Drinkaware figures named on each drink.
 * Nothing here is a guessed pub price or a made-up kcal value.
 */

import { formatGbp, NHS_WEEKS_IN_YEAR, yearlyFromWeekly } from './savings';
import { SUDDEN_STOP_WARNING, type Stage } from './stage';

export const NHS_UNITS_URL = 'https://www.nhs.uk/live-well/alcohol-advice/calculating-alcohol-units/';
export const NHS_CALORIES_URL = 'https://www.nhs.uk/live-well/alcohol-advice/calories-in-alcohol/';
export const NHS_RISKS_URL = 'https://www.nhs.uk/live-well/alcohol-advice/the-risks-of-drinking-too-much/';
export const NHS_ALCOHOL_USE_URL = 'https://www.nhs.uk/conditions/alcohol-use-disorder/';
export const CMO_GUIDELINES_URL = 'https://assets.publishing.service.gov.uk/media/5a80b7ed40f0b623026951db/UK_CMOs__report.pdf';
export const GDG_REPORT_URL = 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/545739/GDG_report-Jan2016.pdf';
export const DRINKaware_GUIDELINES_URL = 'https://www.drinkaware.co.uk/facts/information-about-alcohol/alcohol-and-the-facts/low-risk-drinking-guidelines';
export const DRINKaware_LAGER_URL = 'https://www.drinkaware.co.uk/facts/information-about-alcohol/alcoholic-drinks-and-units/units-and-calories-in-alcoholic-drinks/lager';
export const DRINKaware_SPIRITS_URL = 'https://www.drinkaware.co.uk/facts/information-about-alcohol/alcoholic-drinks-and-units/units-and-calories-in-alcoholic-drinks/spirits';

/** Men and women are advised not to drink more than this on a regular basis. */
export const UK_LOW_RISK_WEEKLY_UNITS = 14;

/**
 * Established UK higher-risk lines: 35 or more a week for women, 50 or more for men.
 * Guidelines development group report to the UK Chief Medical Officers, paragraph 68.
 * Drinkaware uses the same 35+ and 50+ split.
 */
export const UK_HIGHER_RISK_WOMEN_UNITS = 35;
export const UK_HIGHER_RISK_MEN_UNITS = 50;

export const ESTIMATE_DISCLAIMER = 'These are estimates, not medical advice.';

/** Reuse the product withdrawal warning rather than writing a second one. */
export const WITHDRAWAL_NOTE = SUDDEN_STOP_WARNING;

export type RiskSex = 'female' | 'male' | 'unknown';
export type RiskBandId = 'lower' | 'increasing' | 'higher' | 'depends';

export type DrinkSource = {
  label: string;
  url: string;
};

export const DRINK_SOURCES: readonly DrinkSource[] = [
  { label: 'NHS: Calculating alcohol units', url: NHS_UNITS_URL },
  { label: 'NHS: Calories in alcohol', url: NHS_CALORIES_URL },
  { label: 'NHS: The risks of drinking too much', url: NHS_RISKS_URL },
  { label: 'NHS: Alcohol-use disorder', url: NHS_ALCOHOL_USE_URL },
  { label: 'UK Chief Medical Officers’ guidelines', url: CMO_GUIDELINES_URL },
  { label: 'Guidelines development group report', url: GDG_REPORT_URL },
  { label: 'Drinkaware: low-risk guidelines', url: DRINKaware_GUIDELINES_URL },
  { label: 'Drinkaware: calories in lager', url: DRINKaware_LAGER_URL },
  { label: 'Drinkaware: calories in spirits', url: DRINKaware_SPIRITS_URL },
];

/** NHS: up to 158 kcal in a 175ml glass of 12% wine. */
export const NHS_WINE_175_KCAL = 158;

/** Same 12% wine at 250ml: 158 × 250 / 175, rounded to the nearest kcal. */
export const NHS_WINE_250_KCAL = Math.round((NHS_WINE_175_KCAL * 250) / 175);

/**
 * NHS: 4 bottles of 12% wine a month add up to 32,400 kcal a year.
 * 4 × 12 = 48 bottles, so 32,400 / 48 = 675 kcal a bottle.
 * Unit count for a bottle stays the NHS 13.5% figure (10 units).
 */
export const NHS_WINE_BOTTLE_12_KCAL = 32_400 / (4 * 12);

/**
 * NHS: 5 pints of 5.2% lager a week add up to 57,720 kcal a year.
 * 5 × 52 = 260 pints, so 57,720 / 260 = 222 kcal a pint.
 */
export const NHS_PINT_52_KCAL = 57_720 / (5 * NHS_WEEKS_IN_YEAR);

/** NHS table: a 50ml double of 40% spirits is 100 kcal, so a 25ml single is 50. */
export const NHS_SPIRIT_DOUBLE_KCAL = 100;
export const NHS_SPIRIT_SINGLE_KCAL = NHS_SPIRIT_DOUBLE_KCAL / 2;

/** Drinkaware: a pint (568ml) of 4% lager can contain 180 kcal. */
export const DRINKaware_PINT_4_KCAL = 180;

export const CALORIE_BASIS =
  'Calories use published figures. NHS: up to 222 kcal for a pint of 5.2% lager, up to 158 kcal for 175ml of 12% wine, up to 675 kcal for a 12% bottle, and 100 kcal for a 50ml double of 40% spirits (50 kcal for the 25ml single). The 250ml glass is that 158 kcal scaled by 250/175. The lower-strength pint uses Drinkaware’s 180 kcal for a pint of 4% lager, the nearest published lower-strength pint. A bottle’s units are the NHS 13.5% bottle. Drinks vary by brand.';

export const GUIDELINE_EQUIVALENTS =
  '14 units is equivalent to six pints of average-strength beer (4% ABV) or six medium (175ml) glasses of wine (13% ABV).';

export const OVER_GUIDELINE_NOTE =
  'Regularly drinking more than 14 units a week raises the risk of liver disease, cancers of the mouth, throat, breast and bowel, high blood pressure, stroke and heart disease.';

export const LOWER_RISK_NOTE =
  'Keeping to 14 units or under is the UK low-risk guideline. The Chief Medical Officers say the risk of cancers of the mouth, throat and breast increases the more you drink on a regular basis.';

export const SPREAD_NOTE =
  'The Chief Medical Officers advise spreading weekly drinking over 3 or more days, with several drink-free days.';

export const BAND_LEGEND =
  'Lower risk up to 14. Increasing risk above 14. Higher risk: 35 or more for women, 50 or more for men.';

export type NhsDrink = {
  id: string;
  name: string;
  detail: string;
  units: number;
  unitsLabel: string;
  kcal: number;
  kcalLabel: string;
};

export const NHS_DRINKS: readonly NhsDrink[] = [
  { id: 'pint-low', name: 'Pint, lower strength', detail: 'Beer, lager or cider, about 3.6%', units: 2, unitsLabel: 'about 2 units', kcal: DRINKaware_PINT_4_KCAL, kcalLabel: `about ${DRINKaware_PINT_4_KCAL} kcal` },
  { id: 'pint-high', name: 'Pint, higher strength', detail: 'Beer, lager or cider, 5.2%', units: 3, unitsLabel: 'about 3 units', kcal: NHS_PINT_52_KCAL, kcalLabel: `up to ${NHS_PINT_52_KCAL} kcal` },
  { id: 'wine-175', name: 'Glass of wine, 175ml', detail: '12%', units: 2.1, unitsLabel: '2.1 units', kcal: NHS_WINE_175_KCAL, kcalLabel: `up to ${NHS_WINE_175_KCAL} kcal` },
  { id: 'wine-250', name: 'Glass of wine, 250ml', detail: '12%', units: 3, unitsLabel: '3 units', kcal: NHS_WINE_250_KCAL, kcalLabel: `up to ${NHS_WINE_250_KCAL} kcal` },
  { id: 'wine-bottle', name: 'Bottle of wine', detail: '750ml, 13.5%', units: 10, unitsLabel: 'about 10 units', kcal: NHS_WINE_BOTTLE_12_KCAL, kcalLabel: `up to ${NHS_WINE_BOTTLE_12_KCAL} kcal` },
  { id: 'spirit', name: 'Single spirit', detail: '25ml, 40%', units: 1, unitsLabel: '1 unit', kcal: NHS_SPIRIT_SINGLE_KCAL, kcalLabel: `about ${NHS_SPIRIT_SINGLE_KCAL} kcal` },
];

export function unitsForCounts(counts: Record<string, number>): number {
  const total = NHS_DRINKS.reduce((sum, drink) => {
    const count = counts[drink.id] ?? 0;
    if (!Number.isFinite(count) || count <= 0) return sum;
    return sum + drink.units * Math.floor(count);
  }, 0);
  return Math.round(total * 10) / 10;
}

export function kcalForCounts(counts: Record<string, number>): number {
  return NHS_DRINKS.reduce((sum, drink) => {
    const count = counts[drink.id] ?? 0;
    if (!Number.isFinite(count) || count <= 0) return sum;
    return sum + drink.kcal * Math.floor(count);
  }, 0);
}

export function formatWeeklyUnits(total: number): string {
  const rounded = Math.round(total * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatUkNumber(value: number, digits: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export function parseWeeklySpend(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function riskBand(units: number, sex: RiskSex = 'unknown'): { id: RiskBandId; label: string } {
  if (units <= UK_LOW_RISK_WEEKLY_UNITS) {
    return { id: 'lower', label: 'Lower risk. Up to 14 units a week.' };
  }
  const higherForWomen = units >= UK_HIGHER_RISK_WOMEN_UNITS;
  const higherForMen = units >= UK_HIGHER_RISK_MEN_UNITS;
  if (sex === 'female') {
    return higherForWomen
      ? { id: 'higher', label: 'Higher risk. 35 or more units a week for women.' }
      : { id: 'increasing', label: 'Increasing risk. Above 14 units a week, and under 35.' };
  }
  if (sex === 'male') {
    return higherForMen
      ? { id: 'higher', label: 'Higher risk. 50 or more units a week for men.' }
      : { id: 'increasing', label: 'Increasing risk. Above 14 units a week, and under 50.' };
  }
  if (higherForMen) {
    return { id: 'higher', label: 'Higher risk for women (35 or more a week) and for men (50 or more).' };
  }
  if (higherForWomen) {
    return {
      id: 'depends',
      label: 'Higher risk for women (35 or more a week) and increasing risk for men (under 50). Sex is not recorded here, so both are shown.',
    };
  }
  return {
    id: 'increasing',
    label: 'Increasing risk. Above 14 units a week, and under the higher-risk lines of 35 for women and 50 for men.',
  };
}

export type WeekEstimate = {
  hasDrinks: boolean;
  unitsPerWeek: number;
  unitsPerYear: number;
  kcalPerWeek: number;
  kcalPerYear: number;
  spendPerWeek: number | null;
  spendPerYear: number | null;
  bandId: RiskBandId;
  bandLabel: string;
  comparison: string;
  equivalents: string;
  headline: string;
  yearLine: string;
  spendLine: string | null;
  healthNotes: string[];
  withdrawal: string | null;
};

function drinkCount(counts: Record<string, number>, id: string): number {
  const count = counts[id] ?? 0;
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

export function estimateUsualWeek(input: {
  counts: Record<string, number>;
  stage?: Stage | null;
  weeklySpend?: string | number | null;
  sex?: RiskSex;
}): WeekEstimate {
  const counts = input.counts;
  const hasDrinks = NHS_DRINKS.some((drink) => drinkCount(counts, drink.id) > 0);
  const unitsPerWeek = unitsForCounts(counts);
  const kcalPerWeek = kcalForCounts(counts);
  const unitsPerYear = yearlyFromWeekly(unitsPerWeek, 1);
  const kcalPerYear = yearlyFromWeekly(kcalPerWeek, 0);
  const spendPerWeek = parseWeeklySpend(input.weeklySpend);
  const spendPerYear = spendPerWeek == null ? null : yearlyFromWeekly(spendPerWeek, 2);
  const band = riskBand(unitsPerWeek, input.sex ?? 'unknown');
  const unitsText = formatUkNumber(unitsPerWeek, 1);
  const kcalText = formatUkNumber(kcalPerWeek, 0);
  const comparison = unitsPerWeek <= UK_LOW_RISK_WEEKLY_UNITS
    ? 'Within the low-risk guideline of 14 units a week.'
    : `About ${formatUkNumber(unitsPerWeek / UK_LOW_RISK_WEEKLY_UNITS, 1)}x the low-risk guideline.`;
  const equivalents = `About ${formatUkNumber(unitsPerWeek / 10, 1)} bottles of wine, ${formatUkNumber(unitsPerWeek / 2, 1)} pints of lower-strength beer, or ${formatUkNumber(unitsPerWeek / 3, 1)} pints of higher-strength beer.`;
  const stage = input.stage ?? null;
  let headline: string;
  if (stage === 'stopped') {
    headline = spendPerYear == null
      ? `What you are no longer drinking: ${unitsText} units and about ${kcalText} kcal a week.`
      : `What you are no longer drinking: ${unitsText} units, about ${kcalText} kcal, and ${formatGbp(spendPerYear)} saved a year.`;
  } else if (stage === 'trying_to_stop') {
    headline = `While you prepare to stop, a usual week is ${unitsText} units and about ${kcalText} kcal.`;
  } else if (stage === 'cutting_down') {
    headline = `The week you are cutting down from is ${unitsText} units and about ${kcalText} kcal.`;
  } else {
    headline = `A usual week of drinking is ${unitsText} units and about ${kcalText} kcal.`;
  }
  const yearLine = `Over 52 weeks, that is ${formatUkNumber(unitsPerYear, 1)} units and about ${formatUkNumber(kcalPerYear, 0)} kcal.`;
  let spendLine: string | null = null;
  if (spendPerWeek != null && spendPerYear != null) {
    const week = formatGbp(spendPerWeek);
    const year = formatGbp(spendPerYear);
    spendLine = stage === 'stopped'
      ? `From ${week} a week over 52 weeks.`
      : `About ${week} a week, ${year} a year, from the spend you entered.`;
  }
  const healthNotes = hasDrinks
    ? band.id === 'lower'
      ? [LOWER_RISK_NOTE, SPREAD_NOTE]
      : [OVER_GUIDELINE_NOTE, SPREAD_NOTE]
    : [];
  const withdrawal = hasDrinks && (band.id === 'higher' || band.id === 'depends') ? WITHDRAWAL_NOTE : null;
  return {
    hasDrinks,
    unitsPerWeek,
    unitsPerYear,
    kcalPerWeek,
    kcalPerYear,
    spendPerWeek,
    spendPerYear,
    bandId: band.id,
    bandLabel: band.label,
    comparison,
    equivalents,
    headline,
    yearLine,
    spendLine,
    healthNotes,
    withdrawal,
  };
}
