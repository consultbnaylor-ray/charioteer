import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from 'react';

import { DemoRepository } from '@/data/demo-repository';
import { SupabaseRepository } from '@/data/supabase-repository';
import type { AppSnapshot, Repository } from '@/data/types';

const RepoContext = createContext<Repository | null>(null);

export function createRepository(): Repository {
  const mode = process.env.EXPO_PUBLIC_DATA_MODE;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (mode !== 'demo' && url && key) return new SupabaseRepository(url, key);
  return new DemoRepository();
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const repo = useRef<Repository | null>(null);
  if (!repo.current) repo.current = createRepository();
  return <RepoContext.Provider value={repo.current}>{children}</RepoContext.Provider>;
}

export function useRepository(): Repository {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error('Repository missing');
  return repo;
}

export function useSnapshot(): AppSnapshot {
  const repo = useRepository();
  return useSyncExternalStore(
    (listener) => repo.subscribe(listener),
    () => repo.getSnapshot(),
    () => repo.getSnapshot(),
  );
}
