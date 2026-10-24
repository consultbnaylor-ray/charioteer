import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { formatGbp, NHS_WEEKS_IN_YEAR, yearlyFromWeekly } from './savings';
import { SUDDEN_STOP_WARNING } from './stage';
import {
  CALORIE_BASIS,
  DRINKaware_PINT_4_KCAL,
  ESTIMATE_DISCLAIMER,
  estimateUsualWeek,
  formatWeeklyUnits,
  NHS_DRINKS,
  NHS_PINT_52_KCAL,
  NHS_SPIRIT_SINGLE_KCAL,
  NHS_UNITS_URL,
  NHS_WINE_175_KCAL,
  NHS_WINE_250_KCAL,
  NHS_WINE_BOTTLE_12_KCAL,
  OVER_GUIDELINE_NOTE,
  UK_LOW_RISK_WEEKLY_UNITS,
  unitsForCounts,
} from './units';

const benWeek = {
  'pint-low': 4,
  'pint-high': 5,
  'wine-175': 4,
  'wine-250': 1,
  'wine-bottle': 1,
  spirit: 4,
};

describe('NHS weekly units', () => {
  it('uses the NHS published figures', () => {
    expect(NHS_UNITS_URL).toBe('https://www.nhs.uk/live-well/alcohol-advice/calculating-alcohol-units/');
    expect(UK_LOW_RISK_WEEKLY_UNITS).toBe(14);
    expect(NHS_DRINKS.map((drink) => [drink.id, drink.units])).toEqual([
      ['pint-low', 2],
      ['pint-high', 3],
      ['wine-175', 2.1],
      ['wine-250', 3],
      ['wine-bottle', 10],
      ['spirit', 1],
    ]);
  });

  it('adds a week of pints, wine and spirits into the units field', () => {
    expect(unitsForCounts({})).toBe(0);
    expect(formatWeeklyUnits(unitsForCounts({ 'pint-low': 1, 'wine-175': 1 }))).toBe('4.1');
    expect(formatWeeklyUnits(unitsForCounts({ 'pint-high': 2, spirit: 3 }))).toBe('9');
    expect(formatWeeklyUnits(unitsForCounts({ 'wine-bottle': 1, 'wine-250': 1 }))).toBe('13');
    expect(formatWeeklyUnits(unitsForCounts({ 'pint-low': 6, spirit: 2 }))).toBe('14');
    expect(unitsForCounts({ 'pint-low': -2, spirit: 1.9 })).toBe(1);
  });

  it('uses only published calorie figures, including the NHS yearly lager example', () => {
    expect(NHS_WEEKS_IN_YEAR).toBe(52);
    expect(yearlyFromWeekly(5 * 222, 0)).toBe(57_720);
    expect(NHS_PINT_52_KCAL).toBe(222);
    expect(NHS_WINE_175_KCAL).toBe(158);
    expect(NHS_WINE_250_KCAL).toBe(226);
    expect(NHS_WINE_250_KCAL).toBe(Math.round((158 * 250) / 175));
    expect(NHS_WINE_BOTTLE_12_KCAL).toBe(675);
    expect(NHS_SPIRIT_SINGLE_KCAL).toBe(50);
    expect(DRINKaware_PINT_4_KCAL).toBe(180);
    expect(NHS_DRINKS.map((drink) => drink.kcal)).toEqual([180, 222, 158, 226, 675, 50]);
  });

  it('turns Ben’s week into 48.4 units, calories, and 3.5 times the guideline', () => {
    const week = estimateUsualWeek({ counts: benWeek, stage: 'exploring', weeklySpend: '40', sex: 'unknown' });
    expect(week.unitsPerWeek).toBe(48.4);
    expect(week.unitsPerYear).toBe(2516.8);
    expect(week.kcalPerWeek).toBe(3563);
    expect(week.kcalPerYear).toBe(185_276);
    expect(week.comparison).toBe('About 3.5x the low-risk guideline.');
    expect(week.bandId).toBe('depends');
    expect(week.bandLabel).toContain('Higher risk for women');
    expect(week.bandLabel).toContain('increasing risk for men');
    expect(week.equivalents).toBe('About 4.8 bottles of wine, 24.2 pints of lower-strength beer, or 16.1 pints of higher-strength beer.');
    expect(week.headline).toBe('A usual week of drinking is 48.4 units and about 3,563 kcal.');
    expect(week.yearLine).toBe('Over 52 weeks, that is 2,516.8 units and about 185,276 kcal.');
    expect(week.spendPerWeek).toBe(40);
    expect(week.spendPerYear).toBe(2080);
    expect(week.spendLine).toBe(`About ${formatGbp(40)} a week, ${formatGbp(2080)} a year, from the spend you entered.`);
    expect(week.healthNotes[0]).toBe(OVER_GUIDELINE_NOTE);
    expect(week.healthNotes[0]).toContain('liver disease');
    expect(week.healthNotes[0]).toContain('bowel');
    expect(week.healthNotes[1]).toContain('3 or more days');
    expect(week.withdrawal).toBe(SUDDEN_STOP_WARNING);
    expect(week.withdrawal).toContain('NHS 111');
    expect(CALORIE_BASIS).toContain('Drinkaware');
    expect(ESTIMATE_DISCLAIMER).toBe('These are estimates, not medical advice.');
  });

  it('frames a stopped week as units, calories and money no longer spent', () => {
    const week = estimateUsualWeek({ counts: benWeek, stage: 'stopped', weeklySpend: 48 });
    expect(week.headline).toBe(`What you are no longer drinking: 48.4 units, about 3,563 kcal, and ${formatGbp(2496)} saved a year.`);
    expect(week.spendLine).toBe(`From ${formatGbp(48)} a week over 52 weeks.`);
    expect(estimateUsualWeek({ counts: benWeek, stage: 'trying_to_stop' }).headline).toContain('prepare to stop');
    expect(estimateUsualWeek({ counts: benWeek, stage: 'cutting_down' }).headline).toContain('cutting down from');
    expect(estimateUsualWeek({ counts: benWeek, stage: 'stopped' }).headline).not.toContain('saved a year');
  });

  it('keeps the lower-risk band inside 14 and does not invent a spend', () => {
    const within = estimateUsualWeek({ counts: { 'pint-low': 6, spirit: 2 }, stage: 'exploring', weeklySpend: '' });
    expect(within.unitsPerWeek).toBe(14);
    expect(within.bandId).toBe('lower');
    expect(within.comparison).toBe('Within the low-risk guideline of 14 units a week.');
    expect(within.spendLine).toBeNull();
    expect(within.withdrawal).toBeNull();
    expect(within.healthNotes.join(' ')).not.toContain('more than 14 units');
    expect(estimateUsualWeek({ counts: {}, weeklySpend: 'nope' }).hasDrinks).toBe(false);
    expect(estimateUsualWeek({ counts: { spirit: 14 }, sex: 'female' }).bandId).toBe('lower');
    expect(estimateUsualWeek({ counts: { spirit: 15 }, sex: 'female' }).bandId).toBe('increasing');
    expect(estimateUsualWeek({ counts: { spirit: 35 }, sex: 'female' }).bandId).toBe('higher');
    expect(estimateUsualWeek({ counts: { spirit: 35 }, sex: 'male' }).bandId).toBe('increasing');
    expect(estimateUsualWeek({ counts: { spirit: 49 }, sex: 'male' }).bandId).toBe('increasing');
    expect(estimateUsualWeek({ counts: { spirit: 50 }, sex: 'male' }).bandId).toBe('higher');
    expect(estimateUsualWeek({ counts: { spirit: 50 }, sex: 'unknown' }).bandId).toBe('higher');
    expect(estimateUsualWeek({ counts: { spirit: 35 }, sex: 'unknown' }).bandId).toBe('depends');
  });

  it('shows the live estimate wherever weekly units are edited', () => {
    const guide = readFileSync('src/ui/UnitsGuide.tsx', 'utf8');
    expect(guide).toContain('estimateUsualWeek');
    expect(guide).toContain('{estimate.comparison}');
    expect(guide).toContain('{ESTIMATE_DISCLAIMER}');
    expect(guide).toContain('{estimate.withdrawal}');
    const onboarding = readFileSync('src/app/onboarding.tsx', 'utf8');
    const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    expect(guide).toContain('weeklyUnitsGuidance');
    expect(onboarding).toContain('<UnitsGuide onChange={setUnits} stage={stage} weeklySpend={spend} currentUnits={units} />');
    expect(profile).toContain('<UnitsGuide onChange={setUnits} stage={stage} weeklySpend={spend} currentUnits={units} />');
    expect(home).toContain('<UnitsGuide onChange={setDraftUnits} stage={profile.stage} weeklySpend={draftSpend} currentUnits={draftUnits} />');
  });
});
