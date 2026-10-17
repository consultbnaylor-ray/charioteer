import { requestAuthorization, saveQuantitySample, type QuantityTypeIdentifierWriteable } from '@kingstinct/react-native-healthkit';

import type { FoodItem } from '@/domain/nutrition';
import { NUTRITION_HEALTH_WRITES, nutritionHealthQuantities } from '@/domain/nutrition';
import { shownError } from '@/domain/errors';

import type { NutritionWriteResult } from '@/health/writeNutrition';

const toShare = NUTRITION_HEALTH_WRITES.map((row) => row.identifier);

/** Saves today's food and water. Steps, sleep, heart rate, and weight are still read-only. */
export async function writeDayToAppleHealth(items: readonly FoodItem[], waterMl: number): Promise<NutritionWriteResult> {
  try {
    const allowed = await requestAuthorization({ toShare: toShare as QuantityTypeIdentifierWriteable[] });
    if (!allowed) return { ok: false, message: 'Apple Health did not allow saving food.' };
    const quantities = nutritionHealthQuantities(items, waterMl);
    const start = new Date();
    const end = new Date(start.getTime() + 60_000);
    for (const row of NUTRITION_HEALTH_WRITES) {
      const value = quantities[row.key];
      if (!value) continue;
      await saveQuantitySample(row.identifier as QuantityTypeIdentifierWriteable, row.unit as 'g', value, start, end);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: shownError(error, 'Apple Health could not save that meal.') };
  }
}
