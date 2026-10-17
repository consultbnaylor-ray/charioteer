import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';

import { missingHealthAction } from '@/domain/healthStatTiles';
import { healthReadSetChanged } from '@/domain/healthVisibility';
import { APPLE_HEALTH_READ_TYPES, type AppleHealthAccess, type AppleHealthTurnOn, isHealthAccessDenied } from '@/health/connection';
import { loadHealthReadSet, saveHealthReadSet } from '@/health/readSet';

const toRead = [...APPLE_HEALTH_READ_TYPES];

export async function readAppleHealthAccess(): Promise<AppleHealthAccess> {
  if (!isHealthDataAvailable()) return 'unavailable';
  try {
    const status = await getRequestStatusForAuthorization({ toRead });
    if (status === AuthorizationRequestStatus.shouldRequest || status === AuthorizationRequestStatus.unknown) {
      return 'prompt';
    }
    return 'connected';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return isHealthAccessDenied(message) ? 'denied' : 'prompt';
  }
}

/** Opens the HealthKit sheet. A false result means the system did not grant the request. */
export async function connectAppleHealth(): Promise<AppleHealthAccess> {
  if (!isHealthDataAvailable()) return 'unavailable';
  try {
    const allowed = await requestAuthorization({ toRead });
    if (!allowed) return 'denied';
    return readAppleHealthAccess();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isHealthAccessDenied(message)) return 'denied';
    throw error;
  }
}

/** Health app first. The app's own Settings page if that URL cannot be opened. */
export async function openHealthApp(): Promise<void> {
  try {
    const supported = await Linking.canOpenURL('x-apple-health://');
    if (!supported) {
      await Linking.openSettings();
      return;
    }
    await Linking.openURL('x-apple-health://');
  } catch {
    await Linking.openSettings();
  }
}

export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}

/**
 * Asks HealthKit for the missing read types when iOS will still show the sheet.
 * A recorded decision does not show again, so the Health app is opened instead.
 */
export async function turnOnAppleHealthReads(types: readonly string[]): Promise<AppleHealthTurnOn> {
  if (!isHealthDataAvailable()) return 'unavailable';
  const known = new Set<string>(APPLE_HEALTH_READ_TYPES);
  const toRead = types.filter((type): type is (typeof APPLE_HEALTH_READ_TYPES)[number] => known.has(type));
  let status = AuthorizationRequestStatus.unknown;
  if (toRead.length) {
    try {
      status = await getRequestStatusForAuthorization({ toRead });
    } catch {
      status = AuthorizationRequestStatus.unknown;
    }
  }
  const name = status === AuthorizationRequestStatus.unnecessary
    ? 'unnecessary'
    : status === AuthorizationRequestStatus.shouldRequest
      ? 'shouldRequest'
      : 'unknown';
  if (toRead.length && missingHealthAction(name) === 'request') {
    try {
      const allowed = await requestAuthorization({ toRead });
      if (allowed) return 'prompted';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isHealthAccessDenied(message)) throw error;
    }
  }
  await openHealthApp();
  return 'opened';
}

/**
 * An install that already answered the old sheet does not see new types until
 * requestAuthorization is called with them. This does that once per changed set.
 */
export async function ensureCurrentAppleHealthReads(): Promise<'requested' | 'current' | 'unavailable'> {
  if (!isHealthDataAvailable()) return 'unavailable';
  const stored = await loadHealthReadSet();
  if (!healthReadSetChanged(stored, APPLE_HEALTH_READ_TYPES)) return 'current';
  try {
    const allowed = await requestAuthorization({ toRead: [...APPLE_HEALTH_READ_TYPES] });
    if (!allowed) return 'current';
    await saveHealthReadSet(APPLE_HEALTH_READ_TYPES);
    return 'requested';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isHealthAccessDenied(message)) return 'current';
    throw error;
  }
}

/** Asks again for types the sheet has not covered. A recorded decision does not reappear. */
export async function askAppleHealthReads(types: readonly string[]): Promise<AppleHealthTurnOn> {
  const result = await turnOnAppleHealthReads(types);
  if (result === 'prompted') await saveHealthReadSet(APPLE_HEALTH_READ_TYPES);
  return result;
}
