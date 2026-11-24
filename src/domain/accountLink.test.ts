import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  RECONNECTING_ACCOUNT,
  accountLinkForRefreshError,
  authorizationIsAnonymous,
  shouldHoldAnonymousData,
} from './accountLink';
import { SIGN_IN_AGAIN } from './edgeRetry';

describe('account link while a refresh is failing', () => {
  it('keeps retrying a dropped or unreadable refresh, and asks for sign-in when the token is rejected', () => {
    const dropped = new TypeError('Network request failed');
    expect(accountLinkForRefreshError(dropped)).toBe('reconnecting');
    const retryable = Object.assign(new Error('Unexpected end of JSON input'), { name: 'AuthRetryableFetchError', status: 0 });
    expect(accountLinkForRefreshError(retryable)).toBe('reconnecting');
    const gateway = Object.assign(new Error('context canceled'), { name: 'AuthRetryableFetchError', status: 500 });
    expect(accountLinkForRefreshError(gateway)).toBe('reconnecting');
    const rejected = Object.assign(new Error('Invalid Refresh Token: Already Used'), { name: 'AuthApiError', status: 400 });
    expect(accountLinkForRefreshError(rejected)).toBe('sign-in');
    expect(accountLinkForRefreshError(new Error('Auth session missing!'))).toBe('sign-in');
    expect(RECONNECTING_ACCOUNT).toBe('Reconnecting your account…');
    expect(SIGN_IN_AGAIN).toBe('Please sign in again.');
  });

  it('does not send catalogue calls with the publishable key while a person is signed in', () => {
    const anon = 'sb_publishable_test';
    expect(authorizationIsAnonymous(null, anon)).toBe(true);
    expect(authorizationIsAnonymous(`Bearer ${anon}`, anon)).toBe(true);
    expect(authorizationIsAnonymous('Bearer sb_publishable_other', 'legacy-anon')).toBe(true);
    expect(authorizationIsAnonymous('Bearer user-jwt', anon)).toBe(false);
    expect(shouldHoldAnonymousData({ hasUser: true, authorization: `Bearer ${anon}`, anonKey: anon })).toBe(true);
    expect(shouldHoldAnonymousData({ hasUser: false, authorization: `Bearer ${anon}`, anonKey: anon })).toBe(false);
    expect(shouldHoldAnonymousData({ hasUser: true, authorization: 'Bearer user-jwt', anonKey: anon })).toBe(false);
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const refresh = repo.slice(repo.indexOf('private async refresh'), repo.indexOf('private async resignOwnerPhotosNow'));
    expect(refresh.indexOf('ensureFreshSession')).toBeLessThan(refresh.indexOf("from('interests')"));
    expect(refresh).toContain('holdAccount');
    const signed = repo.slice(repo.indexOf('private async signedIn'), repo.indexOf('private sessionTicket'));
    expect(signed).toContain('RECONNECTING_ACCOUNT');
    expect(signed).toContain('SIGN_IN_AGAIN');
    const net = repo.slice(repo.indexOf('global:'), repo.indexOf('void this.start'));
    expect(net).toContain('isAuthRequest');
    expect(net).toContain('anonymousDataBlocked');
    expect(net).not.toContain('liveSession');
    expect(repo).toContain('shouldHoldAnonymousData');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    expect(layout).toContain('RECONNECTING_ACCOUNT');
    expect(layout).toContain("label={signIn ? 'Sign in' : 'Try again'}");
    expect(layout).toContain('SIGN_IN_AGAIN');
  });
});
