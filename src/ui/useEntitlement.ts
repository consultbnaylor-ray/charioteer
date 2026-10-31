import { useEffect, useSyncExternalStore } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { entitlementActive, paywallEnabled, type SubscriptionRecord } from '@/domain/subscription';

type Cache = {
  userId: string | null;
  loading: boolean;
  row: SubscriptionRecord | null;
};

let cache: Cache = { userId: null, loading: false, row: null };
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
  cache = { userId: null, loading: false, row: null };
  emit();
}

export function rememberEntitlement(userId: string, row: SubscriptionRecord | null) {
  cache = { userId, loading: false, row };
  emit();
}

export async function refreshEntitlement(userId: string, load: () => Promise<SubscriptionRecord | null>) {
  cache = { userId, loading: true, row: cache.userId === userId ? cache.row : null };
  emit();
  try {
    const row = await load();
    cache = { userId, loading: false, row };
  } catch {
    cache = { userId, loading: false, row: null };
  }
  emit();
}

export function useEntitlement() {
  const repo = useRepository();
  const snap = useSnapshot();
  const enabled = paywallEnabled();
  const current = useSyncExternalStore(subscribeEntitlement, entitlementSnapshot, entitlementSnapshot);
  const userId = snap.session?.userId ?? null;

  useEffect(() => {
    if (!enabled || !snap.ready) return;
    if (!userId) {
      if (cache.userId !== null) clearEntitlement();
      return;
    }
    if (cache.userId === userId) return;
    void refreshEntitlement(userId, () => repo.loadOwnSubscription());
  }, [enabled, repo, snap.ready, userId]);

  const row = enabled && current.userId === userId ? current.row : null;
  const loading = enabled && Boolean(userId) && (current.userId !== userId || current.loading);
  return {
    enabled,
    loading,
    entitled: enabled ? entitlementActive(row) : false,
    row,
    refresh: () => (userId ? refreshEntitlement(userId, () => repo.loadOwnSubscription()) : Promise.resolve()),
  };
}
