import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';

import { healthTurnOnPlan } from '@/domain/healthStatTiles';
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

/**
 * Health app first. iOS has no link to Privacy > Apps > Charioteer.
 * The app's own Settings page is the fallback, where Health can appear.
 */
export async function openHealthApp(): Promise<void> {
  try {
    const supported = await Linking.canOpenURL('x-apple-health://');
    if (supported) {
      await Linking.openURL('x-apple-health://');
      return;
    }
  } catch {
    // The Health URL failed. Settings is the remaining way out.
  }
  await Linking.openSettings();
}

export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}

/**
 * Asks again for every read type, including ones added after the first sheet.
 * The status is read first: after requestAuthorization it becomes unnecessary
 * even when the sheet just appeared. The request still runs before the Health
 * app is opened. A recorded decision does not show the sheet again.
 */
export async function turnOnAppleHealthReads(_types: readonly string[]): Promise<AppleHealthTurnOn> {
  if (!isHealthDataAvailable()) return 'unavailable';
  let status = AuthorizationRequestStatus.unknown;
  try {
    status = await getRequestStatusForAuthorization({ toRead });
  } catch {
    status = AuthorizationRequestStatus.unknown;
  }
  const name = status === AuthorizationRequestStatus.unnecessary
    ? 'unnecessary'
    : status === AuthorizationRequestStatus.shouldRequest
      ? 'shouldRequest'
      : 'unknown';
  const plan = healthTurnOnPlan(name);
  try {
    await requestAuthorization({ toRead });
    await saveHealthReadSet(APPLE_HEALTH_READ_TYPES);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isHealthAccessDenied(message)) throw error;
  }
  if (plan === 'explain') {
    await openHealthApp();
    return 'opened';
  }
  return 'prompted';
}

/**
 * An install that already answered the old sheet does not see new types until
 * requestAuthorization is called with them. This does that once per changed set.
 */
export async function ensureCurrentAppleHealthReads(): Promise<'requested' | 'current' | 'unavailable'> {
  if (!isHealthDataAvailable()) return 'unavailable';
  const stored = await loadHealthReadSet();
  if (!healthReadSetChanged(stored, APPLE_HEALTH_READ_TYPES)) return 'current';
  // Record the attempt before the native call. A trap in that call cannot be
  // caught, and saving only after success made the next launch ask again.
  const recorded = await saveHealthReadSet(APPLE_HEALTH_READ_TYPES);
  if (!recorded) {
    console.warn('[health] authorization request failed');
    return 'current';
  }
  try {
    const allowed = await requestAuthorization({ toRead: [...APPLE_HEALTH_READ_TYPES] });
    if (!allowed) return 'current';
    return 'requested';
  } catch {
    console.warn('[health] authorization request failed');
    return 'current';
  }
}

/** Asks again for types the sheet has not covered. A recorded decision does not reappear. */
export async function askAppleHealthReads(types: readonly string[]): Promise<AppleHealthTurnOn> {
  const result = await turnOnAppleHealthReads(types);
  if (result === 'prompted') await saveHealthReadSet(APPLE_HEALTH_READ_TYPES);
  return result;
}
