import AsyncStorage from '@react-native-async-storage/async-storage';

import { UserFacingError } from '@/domain/errors';
import { ROUTE_FINDING_OFF } from '@/domain/findRoute';
import {
  ROUTE_CONSENT_STORAGE_KEY,
  ROUTE_CONSENT_VERSION,
  parseRouteConsent,
  routeFindingAllowed,
  type RouteConsentRecord,
} from '@/domain/routeConsent';

type Listener = (record: RouteConsentRecord | null) => void;

const listeners = new Set<Listener>();

export function subscribeRouteConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(record: RouteConsentRecord | null) {
  listeners.forEach((listener) => listener(record));
}

/** Null means route finding has never been chosen on this phone, so it stays off. */
export async function readRouteConsent(): Promise<RouteConsentRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(ROUTE_CONSENT_STORAGE_KEY);
    return parseRouteConsent(raw);
  } catch {
    return null;
  }
}

async function write(granted: boolean): Promise<RouteConsentRecord> {
  const record: RouteConsentRecord = {
    granted,
    at: new Date().toISOString(),
    version: ROUTE_CONSENT_VERSION,
  };
  await AsyncStorage.setItem(ROUTE_CONSENT_STORAGE_KEY, JSON.stringify(record));
  publish(record);
  return record;
}

export function grantRouteFinding(): Promise<RouteConsentRecord> {
  return write(true);
}

export function withdrawRouteFinding(): Promise<RouteConsentRecord> {
  return write(false);
}

/** Stops a route call while the choice is missing, off, or from older wording. */
export async function assertRouteFindingAllowed(): Promise<void> {
  const record = await readRouteConsent();
  if (!routeFindingAllowed(record)) throw new UserFacingError(ROUTE_FINDING_OFF, 'generic');
}
