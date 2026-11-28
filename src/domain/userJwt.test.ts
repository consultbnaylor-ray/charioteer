import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { hasUserJwt } from '../../supabase/functions/_shared/garmin';

function jwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.sig`;
}

describe('garmin oauth start without a user token', () => {
  it('treats a missing, anon, or publishable credential as no user', () => {
    expect(hasUserJwt(null)).toBe(false);
    expect(hasUserJwt('')).toBe(false);
    expect(hasUserJwt('Bearer sb_publishable_key')).toBe(false);
    expect(hasUserJwt(`Bearer ${jwt({ role: 'anon' })}`)).toBe(false);
    expect(hasUserJwt(`Bearer ${jwt({ role: 'authenticated', sub: 'user-1' })}`)).toBe(true);
    expect(hasUserJwt('not-a-jwt')).toBe(false);
    const source = readFileSync('supabase/functions/garmin-oauth-start/index.ts', 'utf8');
    expect(source.indexOf('hasUserJwt(authHeader)')).toBeLessThan(source.indexOf("code: 'config'"));
    expect(source).toContain("return json({ ok: false, code: 'unauthorised' }, 401)");
    expect(source).toContain('garminAuthorizeUrl');
    expect(source).not.toContain('stub');
  });
});
