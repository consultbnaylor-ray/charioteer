import AsyncStorage from '@react-native-async-storage/async-storage';

import { sanitizeClientError } from './clientError';

const KEY = 'charioteer.fatal.v1';

export type StoredFatal = {
  name: string;
  message: string;
};

type FatalHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  setGlobalHandler: (handler: FatalHandler) => void;
  getGlobalHandler: () => FatalHandler;
};

let installed = false;

function errorUtils(): ErrorUtilsLike | null {
  const utils = (globalThis as { ErrorUtils?: Partial<ErrorUtilsLike> }).ErrorUtils;
  if (typeof utils?.setGlobalHandler !== 'function' || typeof utils.getGlobalHandler !== 'function') return null;
  return utils as ErrorUtilsLike;
}

/** Function name from the first stack frame, or the error name. No path or arguments. */
export function stackName(error: unknown): string {
  const named = error instanceof Error ? error.name : '';
  const stack = error instanceof Error ? error.stack ?? '' : '';
  const frame = stack.split('\n').map((line) => line.trim()).find((line) => line.startsWith('at '));
  const called = frame?.match(/^at\s+(?:async\s+)?([A-Za-z_$][\w.$]*)/);
  const raw = called?.[1] || named || 'Error';
  return raw.replace(/[^A-Za-z0-9_.$]/g, '').slice(0, 80) || 'Error';
}

/** Message and stack name only. The stack text itself is not kept. */
export function fatalRecord(error: unknown): StoredFatal {
  return {
    name: stackName(error),
    message: sanitizeClientError(error),
  };
}

export async function saveFatalLocally(error: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(fatalRecord(error)));
  } catch {
    return undefined;
  }
}

export async function readFatalLocally(): Promise<StoredFatal | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: unknown; message?: unknown };
    if (typeof parsed.name !== 'string' || typeof parsed.message !== 'string') return null;
    const name = parsed.name.replace(/[^A-Za-z0-9_.$]/g, '').slice(0, 80);
    const message = sanitizeClientError(parsed.message);
    if (!name || !message) return null;
    return { name, message };
  } catch {
    return null;
  }
}

export async function clearFatalLocally(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    return undefined;
  }
}

/** Sends the saved crash once a session exists. A failed send leaves the local copy. */
export async function uploadStoredFatal(
  log: { logClientError(screen: string, message: string, appBuild: string): Promise<boolean> },
  appBuild: string,
): Promise<void> {
  const stored = await readFatalLocally();
  if (!stored) return;
  const saved = await log.logClientError(stored.name, stored.message, appBuild);
  if (saved) await clearFatalLocally();
}

/** Records an uncaught error, then keeps the previous handler. */
export function installFatalHandler(): void {
  if (installed) return;
  const utils = errorUtils();
  if (!utils) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    void saveFatalLocally(error);
    previous(error, isFatal);
  });
}
