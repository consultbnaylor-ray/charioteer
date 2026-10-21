/** Shown when a profile or chat screen throws while drawing. The press loads it again. */
export const SCREEN_ERROR = 'Something went wrong – Try again';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/** A short line safe to store. Drops addresses and tokens. No stack and no screen contents. */
export function sanitizeClientError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const cleaned = raw.replace(EMAIL, '').replace(TOKEN, '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return cleaned || 'Unknown error';
}

/** Error name and message only. No stack, address, or token. Safe for client_errors. */
export function notificationFailureLine(error: unknown): string {
  const name = error instanceof Error && error.name.trim() ? error.name.trim().slice(0, 40) : 'Error';
  const message = sanitizeClientError(error);
  return `${name}: ${message}`.slice(0, 300);
}

/**
 * What may be stored in client_errors: the step and an error type.
 * Digits, addresses, and free text are dropped.
 */
export function clientErrorRecord(screen: string, message: string): { screen: string; message: string } {
  const step = screen.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'app';
  const trimmed = message.replace(/\s+/g, ' ').trim();
  const labelled = /^([a-z][a-z0-9-]{0,30}):\s*([a-z][a-z0-9-]{0,30})$/i.exec(trimmed);
  if (labelled && !/\d/.test(trimmed)) {
    return { screen: step, message: `${labelled[1].toLowerCase()}: ${labelled[2].toLowerCase()}` };
  }
  let type = 'error';
  if (/timeout|timed out|etimedout/i.test(trimmed)) type = 'timeout';
  else if (/offline|network|failed to fetch|econnreset|enotfound|load failed/i.test(trimmed)) type = 'offline';
  else if (/denied|not authorized|not granted/i.test(trimmed)) type = 'denied';
  else if (/unavailable/i.test(trimmed)) type = 'unavailable';
  else if (/\bHTTP\s+\d{3}\b/i.test(trimmed)) type = 'http';
  else {
    const name = trimmed.split(':')[0]?.replace(/[^A-Za-z]/g, '') ?? '';
    if (name && name.toLowerCase() !== 'error' && name.length <= 40) type = name.toLowerCase();
  }
  return { screen: step, message: type };
}

/** iOS build, then the app version. Never longer than the client_errors column. */
export function clientAppBuild(source?: { buildNumber?: string | null; version?: string | null }): string {
  const build = source?.buildNumber ?? null;
  const version = source?.version ?? null;
  const raw = (typeof build === 'string' && build.trim()) || (typeof version === 'string' && version.trim()) || 'unknown';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 40) || 'unknown';
}
