import type { Repository } from '@/data/types';
import { ensureCurrentAppleHealthReads } from '@/health/link';
import { saveLastSynced } from '@/health/syncedAt';
import { syncAppleHealth } from '@/health/sync';

export type HealthCatchUp = {
  status: 'requested' | 'current' | 'unavailable' | 'web';
  imported: boolean;
  syncedAt: string | null;
};

type HealthSink = Pick<Repository, 'saveHealth' | 'saveBodyComposition' | 'setNutritionSettings' | 'getSnapshot'>;

let pending: Promise<HealthCatchUp> | null = null;

/**
 * When the HealthKit read set has grown, ask for the full set and import the
 * last 8 weeks. A matching set does not show the sheet again.
 */
export function catchUpAppleHealthReads(repo: HealthSink): Promise<HealthCatchUp> {
  if (!pending) {
    pending = runCatchUp(repo).finally(() => {
      pending = null;
    });
  }
  return pending;
}

async function runCatchUp(repo: HealthSink): Promise<HealthCatchUp> {
  const status = await ensureCurrentAppleHealthReads();
  if (status !== 'requested') return { status, imported: false, syncedAt: null };
  const result = await syncAppleHealth(repo.getSnapshot().nutrition.workoutBuckets);
  if (!result.ok) return { status, imported: false, syncedAt: null };
  await repo.saveHealth(result.samples);
  for (const row of result.composition ?? []) {
    await repo.saveBodyComposition({
      recordedOn: row.recordedOn,
      bodyFatPct: row.bodyFatPct,
      leanMassKg: row.leanMassKg,
      waistCm: null,
      source: 'healthkit',
    });
  }
  if (result.activeEnergyKcal != null) {
    await repo.setNutritionSettings({
      ...repo.getSnapshot().nutrition,
      activityEnergyKcal: result.activeEnergyKcal,
    });
  }
  const syncedAt = new Date().toISOString();
  await saveLastSynced(syncedAt);
  return { status, imported: true, syncedAt };
}
