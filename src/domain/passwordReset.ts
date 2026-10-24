/** Exact redirect targets. Each one must be on the Supabase auth allow-list. */
export const PASSWORD_RESET_REDIRECTS = [
  'charioteer://set-password',
  'http://127.0.0.1:43127/set-password',
  'http://localhost:43127/set-password',
] as const;

export function passwordResetRedirect(platform: 'native' | 'web', origin?: string): string {
  if (platform === 'native') return 'charioteer://set-password';
  const base = (origin && origin.trim() ? origin : 'http://127.0.0.1:43127').replace(/\/$/, '');
  return `${base}/set-password`;
}

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string };

/** Reads a password-reset return URL. Other links are ignored. */
export function recoveryLink(url: string): RecoveryLink | null {
  if (!url.includes('set-password')) return null;
  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');
  const query = queryAt === -1 ? '' : url.slice(queryAt + 1, hashAt === -1 ? undefined : hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt + 1);
  const params = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(query);
  const accessToken = params.get('access_token') ?? queryParams.get('access_token') ?? '';
  const refreshToken = params.get('refresh_token') ?? queryParams.get('refresh_token') ?? '';
  const code = queryParams.get('code') ?? params.get('code') ?? '';
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  if (code) return { kind: 'code', code };
  return null;
}
