import { useCallback, useRef, useState } from 'react';

/** Marks one action as waiting, then clears it when the work settles, including a timeout. */
export function runPending<T>(work: () => Promise<T>, onWaiting: (waiting: boolean) => void): Promise<T> {
  onWaiting(true);
  return work().finally(() => onWaiting(false));
}

/** Disables one action at a time and ignores a second tap until it finishes. */
export function usePendingPress() {
  const locks = useRef(new Set<string>());
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());

  const run = useCallback((key: string, work: () => Promise<void>) => {
    if (locks.current.has(key)) return;
    void runPending(work, (waiting) => {
      if (waiting) locks.current.add(key);
      else locks.current.delete(key);
      setKeys(new Set(locks.current));
    });
  }, []);

  const isPending = useCallback((key: string) => keys.has(key), [keys]);
  return { run, isPending };
}
