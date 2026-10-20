import type { AppSnapshot } from '@/data/types';
import { compositionForAssessment, weightPointsFrom } from '@/domain/nutrition';

export {
  APPROXIMATE,
  BMI_ROUGH,
  DOCTOR_NOTE,
  IBA_RULES_URL,
  LOSS_PACE_KG,
  LOSS_PACE_LB,
  NHS_BMI_URL,
  NHS_LOSS_PACE_URL,
  NHS_OBESITY_URL,
  NICE_BMI_HEALTHY_MAX,
  NICE_BMI_HEALTHY_MIN,
  NICE_BMI_URL,
  NO_CUT,
  NOT_BELOW,
  RANGE_CAVEAT,
  boxingClassWindow,
  classStatus,
  formatWeightAmount,
  goalBandLegend,
  goalWeightRange,
  type ClassEdges,
  type ClassPlace,
  type ClassStatus,
  type GoalWeightInput,
  type GoalWeightSource,
  type GoalWeightView,
  type WeightSpan,
  type WeightUnitMode,
} from '../../supabase/functions/_shared/goalWeightRange.ts';

import { goalWeightRange, type WeightUnitMode } from '../../supabase/functions/_shared/goalWeightRange.ts';

/** Figures already on the phone. Nothing here is fetched for the range. */
export function goalWeightFromSnapshot(snap: AppSnapshot, unit: WeightUnitMode = 'kg') {
  const weights = weightPointsFrom(snap.health ?? []);
  const figures = compositionForAssessment(snap.bodyComposition ?? []);
  return goalWeightRange({
    goal: snap.nutrition?.goal ?? null,
    phase: snap.nutrition?.goalPhase ?? null,
    weightClassKg: snap.nutrition?.weightClassKg ?? null,
    weightKg: weights.at(-1)?.kg ?? null,
    heightCm: snap.profile?.heightCm ?? null,
    age: snap.nutrition?.goalAge ?? null,
    sex: snap.nutrition?.goalSex ?? null,
    build: snap.nutrition?.build ?? null,
    bodyFatPct: figures.bodyFatPct,
    waistCm: figures.waistCm,
    unit,
  });
}
