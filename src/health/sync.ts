import type { NewHealthSample } from '@/data/types';

export type HealthSyncResult =
  | { ok: true; samples: NewHealthSample[]; activeEnergyKcal: number | null }
  | { ok: false; message: string };

/** Web and Android read the account's saved readings. Apple Health is iOS-only. */
export async function syncAppleHealth(): Promise<HealthSyncResult> {
  return {
    ok: false,
    message: 'Apple Health connects in the iPhone app. Here you can log readings yourself.',
  };
}
