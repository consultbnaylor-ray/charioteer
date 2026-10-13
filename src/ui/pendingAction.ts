import { useCallback, useRef, useState } from 'react';

/** Disables one action at a time and ignores a second tap until it finishes. */
export function usePendingPress() {
  const locks = useRef(new Set<string>());
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());

  const run = useCallback((key: string, work: () => Promise<void>) => {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setKeys(new Set(locks.current));
    void work().finally(() => {
      locks.current.delete(key);
      setKeys(new Set(locks.current));
    });
  }, []);

  const isPending = useCallback((key: string) => keys.has(key), [keys]);
  return { run, isPending };
}
