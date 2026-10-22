import type { NewHealthSample } from '@/data/types';
import type { WorkoutBucketMap } from '@/domain/nutrition';
import type { AppleHealthBody, AppleHealthComposition } from '@/health/connection';

export type HealthSyncResult =
  | {
    ok: true;
    samples: NewHealthSample[];
    activeEnergyKcal: number | null;
    composition?: AppleHealthComposition[];
  }
  | { ok: false; message: string };

export type AppleHealthBodyRead =
  | { ok: true; body: AppleHealthBody }
  | { ok: false; message: string };

const HEALTH_HERE = 'Apple Health connects in the iPhone app. Here you can log readings yourself.';

/** Web and Android read the account's saved readings. Apple Health is iOS-only. */
export async function syncAppleHealth(
  _overrides: WorkoutBucketMap = {},
  _options?: { authorize?: boolean },
): Promise<HealthSyncResult> {
  return { ok: false, message: HEALTH_HERE };
}

/** Web and Android have no Health store. The goal card asks for weight and height instead. */
export async function readAppleHealthBody(): Promise<AppleHealthBodyRead> {
  return { ok: false, message: HEALTH_HERE };
}
