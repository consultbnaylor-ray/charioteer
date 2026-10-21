import type { Repository } from '@/data/types';
import { clientAppBuild } from '@/domain/clientError';
import { isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import {
  APPLE_HEALTH_READ_ERROR,
  healthRefreshLogLine,
  healthRowsToUpload,
  inHealthUploadWindow,
} from '@/domain/healthUpload';
import { APPLE_HEALTH_UNAVAILABLE, isHealthAccessDenied } from '@/health/connection';
import { ensureCurrentAppleHealthReads } from '@/health/link';
import { loadLastSynced, saveLastSynced } from '@/health/syncedAt';
import { syncAppleHealth } from '@/health/sync';

export type HealthCatchUp = {
  status: 'requested' | 'current' | 'unavailable' | 'web';
  imported: boolean;
  syncedAt: string | null;
  error: string | null;
};

type HealthSink = Pick<Repository, 'saveHealth' | 'saveBodyComposition' | 'setNutritionSettings' | 'getSnapshot' | 'logClientError'>;

export type HealthRefresh = { ok: true; syncedAt: string } | { ok: false; message: string };

let pending: Promise<HealthCatchUp> | null = null;

/** A current read set still needs a fresh import. Only a missing Health store skips it. */
export function healthCatchUpImports(status: HealthCatchUp['status']): boolean {
  return status === 'current' || status === 'requested';
}

/**
 * Ask for any new HealthKit types, then import.
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

async function reportHealthRefresh(repo: HealthSink, step: 'read' | 'upload', error: unknown): Promise<void> {
  const line = healthRefreshLogLine(step, error);
  let build = 'unknown';
  try {
    const constants = await import('expo-constants');
    build = clientAppBuild({
      buildNumber: constants.default.expoConfig?.ios?.buildNumber,
      version: constants.default.expoConfig?.version,
    });
  } catch {
    build = 'unknown';
  }
  await repo.logClientError('health-refresh', line, build).catch(() => false);
}

/**
 * Read Apple Health, then upload. The two failures stay separate.
 * The first import sends the whole read. Later imports send new or changed rows from the last 14 days.
 */
export async function refreshAppleHealth(
  repo: HealthSink,
  options?: { authorize?: boolean },
): Promise<HealthRefresh> {
  const today = isoDay(new Date());
  const firstImport = (await loadLastSynced()) == null;
  let result: Awaited<ReturnType<typeof syncAppleHealth>>;
  try {
    result = await syncAppleHealth(repo.getSnapshot().nutrition.workoutBuckets, {
      authorize: options?.authorize !== false,
    });
  } catch (error) {
    await reportHealthRefresh(repo, 'read', error);
    return { ok: false, message: APPLE_HEALTH_READ_ERROR };
  }
  if (!result.ok) {
    if (isHealthAccessDenied(result.message) || result.message === APPLE_HEALTH_UNAVAILABLE) {
      return { ok: false, message: result.message };
    }
    await reportHealthRefresh(repo, 'read', result.message);
    return { ok: false, message: APPLE_HEALTH_READ_ERROR };
  }
  try {
    const samples = healthRowsToUpload(result.samples, {
      firstImport,
      today,
      stored: repo.getSnapshot().health,
    });
    await repo.saveHealth(samples);
    for (const row of result.composition ?? []) {
      if (!inHealthUploadWindow(row.recordedOn, today, firstImport)) continue;
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
    return { ok: true, syncedAt };
  } catch (error) {
    await reportHealthRefresh(repo, 'upload', error);
    return { ok: false, message: shownError(error, 'Could not refresh Apple Health.') };
  }
}

async function runCatchUp(repo: HealthSink): Promise<HealthCatchUp> {
  const status = await ensureCurrentAppleHealthReads();
  if (!healthCatchUpImports(status)) return { status, imported: false, syncedAt: null, error: null };
  const refreshed = await refreshAppleHealth(repo, { authorize: false });
  if (!refreshed.ok) return { status, imported: false, syncedAt: null, error: refreshed.message };
  return { status, imported: true, syncedAt: refreshed.syncedAt, error: null };
}
