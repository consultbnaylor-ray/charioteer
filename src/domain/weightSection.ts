/**
 * Health Stats hides the body section: the weight, body-fat, waist, and lean-mass
 * cards, their charts and More info sheets, the body reading form, the Body heading,
 * and the "Body: weight, waist and BMI" row.
 * Set this to true to bring that section back.
 * Mentions on other cards, the week summary, Today, and the Apple Health lists stay,
 * each with "Update your weight".
 * The code, the tables, and saved readings stay. Profile and the body page stay either way.
 */
export const SHOW_WEIGHT_SECTION = false;

/** The Health Stats body section. These tiles, charts, and the reading form move together. */
export const WEIGHT_SECTION_TILE_IDS = ['weight_kg', 'body_fat', 'waist', 'lean_mass'] as const;

/**
 * Tiles left off the Health Stats board.
 * While the section is parked, body fat and lean mass go with weight and waist.
 * While it is on, weight and waist stay on the body page and the other body tiles stay here.
 */
export function healthStatsOmittedTiles(): readonly string[] {
  return SHOW_WEIGHT_SECTION ? ['weight_kg', 'waist'] : [...WEIGHT_SECTION_TILE_IDS];
}
