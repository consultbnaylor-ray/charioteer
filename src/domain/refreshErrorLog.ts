import AsyncStorage from '@react-native-async-storage/async-storage';

import { sanitizeClientError } from './clientError';

const KEY = 'charioteer.auth-refresh.v1';
const LIMIT = 8;

export type StoredRefreshError = {
  at: string;
  line: string;
};

type KeyValue = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 0 && status <= 599 ? status : null;
}

/** Name, status, and message. Tokens and addresses are removed. */
export function refreshErrorLine(error: unknown): string {
  const name = error instanceof Error && error.name.trim() ? error.name.trim().slice(0, 60) : 'Error';
  const status = statusOf(error);
  const message = sanitizeClientError(error);
  const head = status != null && status > 0 ? `${name} ${status}` : name;
  return `${head}: ${message}`.replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function pushRefreshError(current: StoredRefreshError[], error: unknown, now = new Date()): StoredRefreshError[] {
  const line = refreshErrorLine(error);
  if (!line) return current.slice(-LIMIT);
  if (current[current.length - 1]?.line === line) return current;
  return [...current, { at: now.toISOString(), line }].slice(-LIMIT);
}

function parseStored(raw: string | null): StoredRefreshError[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const at = (item as { at?: unknown }).at;
      const line = (item as { line?: unknown }).line;
      if (typeof at !== 'string' || typeof line !== 'string') return [];
      const clean = sanitizeClientError(line).slice(0, 300);
      if (!clean || clean === 'Unknown error') return [];
      return [{ at: at.slice(0, 40), line: clean }];
    }).slice(-LIMIT);
  } catch {
    return [];
  }
}

export async function readRefreshErrors(storage: KeyValue = AsyncStorage): Promise<StoredRefreshError[]> {
  try {
    return parseStored(await storage.getItem(KEY));
  } catch {
    return [];
  }
}

export async function rememberRefreshError(error: unknown, storage: KeyValue = AsyncStorage, now = new Date()): Promise<void> {
  try {
    const next = pushRefreshError(await readRefreshErrors(storage), error, now);
    await storage.setItem(KEY, JSON.stringify(next));
  } catch {
    return undefined;
  }
}

export async function writeRefreshErrors(items: StoredRefreshError[], storage: KeyValue = AsyncStorage): Promise<void> {
  try {
    if (!items.length) {
      await storage.setItem(KEY, '[]');
      return;
    }
    await storage.setItem(KEY, JSON.stringify(items.slice(-LIMIT)));
  } catch {
    return undefined;
  }
}

/** Sends each saved line once a user token works again. A failed send stays on the phone. */
export async function uploadStoredRefreshErrors(
  log: { logAuthRefresh(line: string): Promise<boolean> },
  storage: KeyValue = AsyncStorage,
): Promise<void> {
  const stored = await readRefreshErrors(storage);
  if (!stored.length) return;
  const pending: StoredRefreshError[] = [];
  for (const item of stored) {
    const saved = await log.logAuthRefresh(item.line);
    if (!saved) pending.push(item);
  }
  await writeRefreshErrors(pending, storage);
}
