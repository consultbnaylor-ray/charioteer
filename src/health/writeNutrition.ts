import type { FoodItem } from '@/domain/nutrition';

export type NutritionWriteResult = { ok: true } | { ok: false; message: string };

/** Web and Android have no HealthKit. The iPhone build uses writeNutrition.ios.ts. */
export async function writeDayToAppleHealth(_items: readonly FoodItem[], _waterMl: number): Promise<NutritionWriteResult> {
  return { ok: false, message: 'Apple Health connects in the iPhone app.' };
}
