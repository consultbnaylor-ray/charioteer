import { useEffect, useSyncExternalStore } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { overrideActive, type EntitlementOverride } from '@/domain/entitlementOverride';
import { FETCH_TIMEOUT_MS } from '@/domain/retryFetch';
import { entitlementActive, paywallEnabled, type SubscriptionRecord } from '@/domain/subscription';

type Cache = {
  userId: string | null;
  loading: boolean;
  failed: boolean;
  row: SubscriptionRecord | null;
};

let cache: Cache = { userId: null, loading: false, failed: false, row: null };

function withLookupTimeout<T>(work: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The request timed out.')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeEntitlement(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function entitlementSnapshot(): Cache {
  return cache;
}

export function clearEntitlement() {
  cache = { userId: null, loading: false, failed: false, row: null };
  emit();
}

export function rememberEntitlement(userId: string, row: SubscriptionRecord | null) {
  cache = { userId, loading: false, failed: false, row };
  emit();
}

export async function refreshEntitlement(userId: string, load: () => Promise<SubscriptionRecord | null>) {
  const kept = cache.userId === userId ? cache.row : null;
  cache = { userId, loading: true, failed: false, row: kept };
  emit();
  try {
    const row = await withLookupTimeout(load());
    cache = { userId, loading: false, failed: false, row };
  } catch {
    cache = { userId, loading: false, failed: kept == null, row: kept };
  }
  emit();
}

type OverrideCache = {
  userId: string | null;
  loading: boolean;
  failed: boolean;
  row: EntitlementOverride | null;
};

let overrideCache: OverrideCache = { userId: null, loading: false, failed: false, row: null };
const overrideListeners = new Set<() => void>();

function emitOverride() {
  for (const listener of overrideListeners) listener();
}

function subscribeOverride(listener: () => void) {
  overrideListeners.add(listener);
  return () => {
    overrideListeners.delete(listener);
  };
}

/** The signed-in person's comp, including while the paywall flag is off. */
export function useEntitlementOverride() {
  const repo = useRepository();
  const snap = useSnapshot();
  const current = useSyncExternalStore(subscribeOverride, () => overrideCache, () => overrideCache);
  const userId = snap.session?.userId ?? null;

  useEffect(() => {
    if (!snap.ready) return;
    if (!userId) {
      if (overrideCache.userId !== null) {
        overrideCache = { userId: null, loading: false, failed: false, row: null };
        emitOverride();
      }
      return;
    }
    if (overrideCache.userId === userId && !overrideCache.loading) return;
    void refreshEntitlementOverride(userId, () => repo.loadEntitlementOverride());
  }, [repo, snap.ready, userId]);

  const row = current.userId === userId ? current.row : null;
  return {
    row: overrideActive(row) ? row : null,
    loading: Boolean(userId) && (current.userId !== userId || current.loading),
    failed: Boolean(userId) && current.userId === userId && current.failed,
  };
}

export async function refreshEntitlementOverride(userId: string, load: () => Promise<EntitlementOverride | null>) {
  const kept = overrideCache.userId === userId ? overrideCache.row : null;
  overrideCache = { userId, loading: true, failed: false, row: kept };
  emitOverride();
  try {
    const row = await withLookupTimeout(load());
    overrideCache = { userId, loading: false, failed: false, row };
  } catch {
    overrideCache = { userId, loading: false, failed: kept == null, row: kept };
  }
  emitOverride();
}

export function useEntitlement() {
  const repo = useRepository();
  const snap = useSnapshot();
  const enabled = paywallEnabled();
  const comp = useEntitlementOverride();
  const current = useSyncExternalStore(subscribeEntitlement, entitlementSnapshot, entitlementSnapshot);
  const userId = snap.session?.userId ?? null;

  // The subscription row is read even while the paywall flag is off, so the AI credits line shows the real plan.
  useEffect(() => {
    if (!snap.ready) return;
    if (!userId) {
      if (cache.userId !== null) clearEntitlement();
      return;
    }
    if (cache.userId === userId) return;
    void refreshEntitlement(userId, () => repo.loadOwnSubscription());
  }, [repo, snap.ready, userId]);

  const planRow = current.userId === userId ? current.row : null;
  const planLoading = Boolean(userId) && (current.userId !== userId || current.loading);
  const planFailed = Boolean(userId) && current.userId === userId && current.failed;
  const row = enabled ? planRow : null;
  const loading = enabled && planLoading;
  return {
    enabled,
    loading,
    failed: enabled && Boolean(userId) && current.userId === userId && current.failed,
    entitled: enabled ? (entitlementActive(row) || comp.row != null) : false,
    comp: comp.row,
    compLoading: comp.loading,
    compFailed: comp.failed,
    row,
    /** The store subscription whatever the paywall flag says. For the AI credits line only, not for gating. */
    planRow,
    planLoading,
    planFailed,
    refresh: () => {
      if (!userId) return Promise.resolve();
      const jobs = [
        refreshEntitlement(userId, () => repo.loadOwnSubscription()),
        refreshEntitlementOverride(userId, () => repo.loadEntitlementOverride()),
      ];
      return Promise.all(jobs).then(() => undefined);
    },
  };
}
