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

/** iOS build, then the app version. Never longer than the client_errors column. */
export function clientAppBuild(source?: { buildNumber?: string | null; version?: string | null }): string {
  const build = source?.buildNumber ?? null;
  const version = source?.version ?? null;
  const raw = (typeof build === 'string' && build.trim()) || (typeof version === 'string' && version.trim()) || 'unknown';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 40) || 'unknown';
}
