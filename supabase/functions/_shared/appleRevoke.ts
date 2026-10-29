/**
 * Sign in with Apple token revoke. Written for account deletion. Do not deploy this from the app.
 * Secrets, names only: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_CLIENT_ID.
 * APPLE_PRIVATE_KEY is the p8 PEM. The authorization code is not stored.
 */

export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';

const SECRET_NAMES = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_CLIENT_ID'] as const;

export type AppleSecretEnv = { get(name: string): string | undefined };

export type AppleSecrets = {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  clientId: string;
};

export function readAppleSecrets(env: AppleSecretEnv): AppleSecrets | null {
  const values = SECRET_NAMES.map((name) => (env.get(name) ?? '').trim().replace(/\\n/g, '\n'));
  if (values.some((value) => value === '')) return null;
  const [teamId, keyId, privateKeyPem, clientId] = values;
  return { teamId, keyId, privateKeyPem, clientId };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/** A short-lived client secret. Apple accepts at most six months. */
export async function appleClientSecret(input: AppleSecrets & { nowSeconds?: number }): Promise<string> {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: input.keyId })));
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    iss: input.teamId,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: input.clientId,
  })));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(input.privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function exchangeAppleAuthorizationCode(input: {
  code: string;
  secrets: AppleSecrets;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const clientSecret = await appleClientSecret(input.secrets);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.secrets.clientId,
    client_secret: clientSecret,
  });
  const response = await (input.fetchImpl ?? fetch)(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null) as { refresh_token?: unknown } | null;
  const token = json && typeof json.refresh_token === 'string' ? json.refresh_token.trim() : '';
  return token || null;
}

export async function revokeAppleRefreshToken(input: {
  refreshToken: string;
  secrets: AppleSecrets;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const clientSecret = await appleClientSecret(input.secrets);
  const body = new URLSearchParams({
    client_id: input.secrets.clientId,
    client_secret: clientSecret,
    token: input.refreshToken,
    token_type_hint: 'refresh_token',
  });
  const response = await (input.fetchImpl ?? fetch)(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  return response.ok;
}

export function signedInWithApple(identities: { provider?: string | null }[] | null | undefined): boolean {
  return (identities ?? []).some((identity) => identity.provider === 'apple');
}

export function appleTableMissing(message: string): boolean {
  return /does not exist|schema cache|could not find the table/i.test(message);
}
