import { useSyncExternalStore } from 'react';

import type { HealthStatPeriod } from '@/domain/healthStatTiles';
import { loadHealthStatPeriod, saveHealthStatPeriod } from '@/health/statPeriod';

let current: HealthStatPeriod = '7';
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    void loadHealthStatPeriod().then((saved) => {
      current = saved;
      emit();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): HealthStatPeriod {
  return current;
}

/** The Day / 7 days / 30 days choice, shared by every stats section and stored on the phone. */
export function useStatPeriod(): [HealthStatPeriod, (next: HealthStatPeriod) => void] {
  const period = useSyncExternalStore(subscribe, snapshot, snapshot);
  function setPeriod(next: HealthStatPeriod) {
    current = next;
    emit();
    void saveHealthStatPeriod(next);
  }
  return [period, setPeriod];
}
