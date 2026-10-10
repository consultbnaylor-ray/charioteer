import type { NewHealthSample } from '@/data/types';

export type HealthSyncResult =
  | { ok: true; samples: NewHealthSample[] }
  | { ok: false; message: string };

/** Web and Android read the account's saved readings. Apple Health is iOS-only. */
export async function syncAppleHealth(): Promise<HealthSyncResult> {
  return {
    ok: false,
    message: 'Apple Health is available in the iOS dev build. On the web, log readings here and Thumos can see them.',
  };
}
