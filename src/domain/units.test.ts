import { describe, expect, it } from 'vitest';

import { formatWeeklyUnits, NHS_DRINKS, NHS_UNITS_URL, UK_LOW_RISK_WEEKLY_UNITS, unitsForCounts } from './units';

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
});
