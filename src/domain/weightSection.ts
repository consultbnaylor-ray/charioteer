/**
 * Health Stats hides weight and body composition.
 * Set this to true to bring back the Health Stats body cards, the body reading form,
 * the weight chart notes, and the "Body: weight, waist and BMI" row.
 * The code, the tables, and saved readings stay. Profile and the body page stay either way.
 */
export const SHOW_WEIGHT_SECTION = false;

/** The Health Stats body section. These tiles, charts, and the reading form move together. */
export const WEIGHT_SECTION_TILE_IDS = ['weight_kg', 'body_fat', 'waist', 'lean_mass'] as const;

/**
 * Named on Health Stats only while the section is shown.
 * Apple Health still requests these reads. The purpose strings are unchanged.
 */
export const WEIGHT_SECTION_HEALTH_TYPES = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
] as const;

const HIDDEN_HEALTH_TYPES = new Set<string>(WEIGHT_SECTION_HEALTH_TYPES);

/**
 * Tiles left off the Health Stats board.
 * While the section is parked, body fat and lean mass go with weight and waist.
 * While it is on, weight and waist stay on the body page and the other body tiles stay here.
 */
export function healthStatsOmittedTiles(): readonly string[] {
  return SHOW_WEIGHT_SECTION ? ['weight_kg', 'waist'] : [...WEIGHT_SECTION_TILE_IDS];
}

/** Drop weight readings from a Health Stats comment. Other readings stay. */
export function withoutWeightSamples<T extends { kind: string }>(samples: readonly T[]): T[] {
  if (SHOW_WEIGHT_SECTION) return [...samples];
  return samples.filter((sample) => sample.kind !== 'weight_kg');
}

/** Drop weight, body fat, and lean mass from a Health Stats list. Height stays. */
export function hideWeightHealthRows<T extends { type: string }>(rows: readonly T[]): T[] {
  if (SHOW_WEIGHT_SECTION) return [...rows];
  return rows.filter((row) => !HIDDEN_HEALTH_TYPES.has(row.type));
}
