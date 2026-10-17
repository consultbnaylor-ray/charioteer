import type { AppleHealthAccess, AppleHealthTurnOn } from '@/health/connection';

/** Web and Android have no HealthKit. The iPhone build uses link.ios.ts. */
export async function readAppleHealthAccess(): Promise<AppleHealthAccess> {
  return 'web';
}

export async function connectAppleHealth(): Promise<AppleHealthAccess> {
  return 'web';
}

export async function openHealthApp(): Promise<void> {}

export async function openAppSettings(): Promise<void> {}

export async function turnOnAppleHealthReads(_types: readonly string[]): Promise<AppleHealthTurnOn> {
  return 'web';
}

/** Web and Android have no Health sheet. The iPhone build asks when the read set changes. */
export async function ensureCurrentAppleHealthReads(): Promise<'requested' | 'current' | 'unavailable' | 'web'> {
  return 'web';
}

export async function askAppleHealthReads(_types: readonly string[]): Promise<AppleHealthTurnOn> {
  return 'web';
}
