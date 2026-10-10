/**
 * Published NHS drink sizes from
 * https://www.nhs.uk/live-well/alcohol-advice/calculating-alcohol-units/
 * A bottle is stated in the page text as 10 units. The others are the drinks table.
 * The pint of 5.2% lager is 2.95 by the formula; the NHS rounds it to 3.
 */

export const NHS_UNITS_URL = 'https://www.nhs.uk/live-well/alcohol-advice/calculating-alcohol-units/';

/** Men and women are advised not to drink more than this on a regular basis. */
export const UK_LOW_RISK_WEEKLY_UNITS = 14;

export type NhsDrink = {
  id: string;
  name: string;
  detail: string;
  units: number;
  unitsLabel: string;
};

export const NHS_DRINKS: readonly NhsDrink[] = [
  { id: 'pint-low', name: 'Pint, lower strength', detail: 'Beer, lager or cider, about 3.6%', units: 2, unitsLabel: 'about 2 units' },
  { id: 'pint-high', name: 'Pint, higher strength', detail: 'Beer, lager or cider, 5.2%', units: 3, unitsLabel: 'about 3 units' },
  { id: 'wine-175', name: 'Glass of wine, 175ml', detail: '12%', units: 2.1, unitsLabel: '2.1 units' },
  { id: 'wine-250', name: 'Glass of wine, 250ml', detail: '12%', units: 3, unitsLabel: '3 units' },
  { id: 'wine-bottle', name: 'Bottle of wine', detail: '750ml, 13.5%', units: 10, unitsLabel: 'about 10 units' },
  { id: 'spirit', name: 'Single spirit', detail: '25ml, 40%', units: 1, unitsLabel: '1 unit' },
];

export function unitsForCounts(counts: Record<string, number>): number {
  const total = NHS_DRINKS.reduce((sum, drink) => {
    const count = counts[drink.id] ?? 0;
    if (!Number.isFinite(count) || count <= 0) return sum;
    return sum + drink.units * Math.floor(count);
  }, 0);
  return Math.round(total * 10) / 10;
}

export function formatWeeklyUnits(total: number): string {
  const rounded = Math.round(total * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
