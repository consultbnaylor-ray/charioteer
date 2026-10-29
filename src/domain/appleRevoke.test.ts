import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  appleClientSecret,
  exchangeAppleAuthorizationCode,
  readAppleSecrets,
  revokeAppleRefreshToken,
  signedInWithApple,
} from '../../supabase/functions/_shared/appleRevoke';

function pem(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

const secrets = {
  teamId: 'TEAMID123',
  keyId: 'KEYID12345',
  privateKeyPem: pem(),
  clientId: 'uk.co.quanticalabs.charioteer',
};

describe('Sign in with Apple revoke', () => {
  it('stays closed until every secret is set, and signs a client secret', async () => {
    expect(readAppleSecrets({ get: () => '' })).toBeNull();
    expect(readAppleSecrets({ get: (name) => name === 'APPLE_PRIVATE_KEY' ? '' : 'set' })).toBeNull();
    const secret = await appleClientSecret({ ...secrets, nowSeconds: 1_700_000_000 });
    const [header, payload] = secret.split('.').slice(0, 2).map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));
    expect(header).toMatchObject({ alg: 'ES256', kid: secrets.keyId });
    expect(payload).toMatchObject({
      iss: secrets.teamId,
      aud: 'https://appleid.apple.com',
      sub: secrets.clientId,
      iat: 1_700_000_000,
    });
    expect(signedInWithApple([{ provider: 'email' }])).toBe(false);
    expect(signedInWithApple([{ provider: 'apple' }])).toBe(true);
  });

  it('exchanges the code and revokes the refresh token without keeping the code', async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      if (String(url) === APPLE_TOKEN_URL) {
        return new Response(JSON.stringify({ refresh_token: 'refresh-1' }), { status: 200 });
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const refresh = await exchangeAppleAuthorizationCode({ code: 'auth-code', secrets, fetchImpl });
    expect(refresh).toBe('refresh-1');
    expect(calls[0]?.url).toBe(APPLE_TOKEN_URL);
    expect(calls[0]?.body).toContain('grant_type=authorization_code');
    expect(calls[0]?.body).toContain('code=auth-code');
    const revoked = await revokeAppleRefreshToken({ refreshToken: 'refresh-1', secrets, fetchImpl });
    expect(revoked).toBe(true);
    expect(calls[1]?.url).toBe(APPLE_REVOKE_URL);
    expect(calls[1]?.body).toContain('token_type_hint=refresh_token');
    expect(calls[1]?.body).toContain('token=refresh-1');
    const deleted = readFileSync('supabase/functions/account-delete/index.ts', 'utf8');
    expect(deleted.indexOf('revokeSignInWithApple')).toBeLessThan(deleted.indexOf('deleteUser'));
    expect(deleted).toContain('Could not revoke Sign in with Apple, so the account was left in place.');
    const store = readFileSync('supabase/functions/siwa-token/index.ts', 'utf8');
    expect(store).toContain('apple_siwa_tokens');
    expect(store).not.toContain('console.log');
    const signIn = readFileSync('src/auth/appleSignIn.ios.ts', 'utf8');
    expect(signIn).toContain('authorizationCode');
    expect(signIn).toContain("invoke('siwa-token'");
    expect(signIn).not.toContain('access_token: credential.authorizationCode');
  });
});
