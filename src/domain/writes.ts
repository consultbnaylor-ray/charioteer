import type { DirectMessage } from '@/data/types';

/** One shared promise per key, so a second tap joins the call already running. */
export function shareInflight(): (key: string, work: () => Promise<void>) => Promise<void> {
  const pending = new Map<string, Promise<void>>();
  return (key, work) => {
    const existing = pending.get(key);
    if (existing) return existing;
    const run = work().finally(() => {
      if (pending.get(key) === run) pending.delete(key);
    });
    pending.set(key, run);
    return run;
  };
}

/** Postgres unique violations, including a retry that inserts the same client id. */
export function isDuplicateWrite(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '23505' || /duplicate key|already exists/i.test(error.message ?? '');
}

/** Server rows win. A local copy stays only until that id comes back. */
export function mergeOutgoingMessages(server: readonly DirectMessage[], outgoing: readonly DirectMessage[]): readonly DirectMessage[] {
  if (!outgoing.length) return server;
  const seen = new Set(server.map((message) => message.id));
  const extra = outgoing.filter((message) => !seen.has(message.id));
  if (!extra.length) return server;
  return [...server, ...extra].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
