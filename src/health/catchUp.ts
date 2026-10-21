import { shownError } from '@/domain/errors';
import type { Repository } from '@/data/types';
import { ensureCurrentAppleHealthReads } from '@/health/link';
import { saveLastSynced } from '@/health/syncedAt';
import { syncAppleHealth } from '@/health/sync';

export type HealthCatchUp = {
  status: 'requested' | 'current' | 'unavailable' | 'web';
  imported: boolean;
  syncedAt: string | null;
  error: string | null;
};

type HealthSink = Pick<Repository, 'saveHealth' | 'saveBodyComposition' | 'setNutritionSettings' | 'getSnapshot'>;

let pending: Promise<HealthCatchUp> | null = null;

/** A current read set still needs a fresh import. Only a missing Health store skips it. */
export function healthCatchUpImports(status: HealthCatchUp['status']): boolean {
  return status === 'current' || status === 'requested';
}

/**
 * Ask for any new HealthKit types, then import the last 12 months.
 * A matching set does not show the sheet again. A failed import is returned
 * on `error` and does not move the last-updated clock.
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
  if (!healthCatchUpImports(status)) return { status, imported: false, syncedAt: null, error: null };
  try {
    const result = await syncAppleHealth(repo.getSnapshot().nutrition.workoutBuckets, { authorize: false });
    if (!result.ok) {
      return { status, imported: false, syncedAt: null, error: result.message || 'Could not refresh Apple Health.' };
    }
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
    return { status, imported: true, syncedAt, error: null };
  } catch (error) {
    return { status, imported: false, syncedAt: null, error: shownError(error, 'Could not refresh Apple Health.') };
  }
}
