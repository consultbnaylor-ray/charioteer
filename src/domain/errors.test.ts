import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  EMAIL_TAKEN_MESSAGE,
  OFFLINE_MESSAGE,
  UserFacingError,
  WEAK_PASSWORD_MESSAGE,
  WRONG_PASSWORD_MESSAGE,
  asUserFacing,
  isTransientNetworkError,
  privateMessageFailure,
} from './errors';
import { fetchWithOneRetry } from './retryFetch';
import { PASSWORD_RESET_REDIRECTS, passwordResetRedirect, recoveryLink } from './passwordReset';

const LOST = 'fetch failed: UnexpectedException: The network connection was lost. (at ExpoModulesCore/Promise.swift:56)';

describe('user facing errors', () => {
  it('turns the iPhone network failure into plain English and hides the module path', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const faced = asUserFacing(new Error(LOST), 'sign-up');
    expect(faced.code).toBe('offline');
    expect(faced.message).toBe(OFFLINE_MESSAGE);
    expect(faced.message).not.toMatch(/swift|ExpoModules|UnexpectedException|fetch failed/i);
    expect(isTransientNetworkError(new Error(LOST))).toBe(true);
    error.mockRestore();
  });

  it('maps the auth cases used on sign-in and sign-up', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(asUserFacing(new Error('Invalid login credentials'), 'sign-in').message).toBe(WRONG_PASSWORD_MESSAGE);
    expect(asUserFacing(Object.assign(new Error('User already registered'), { code: 'user_already_exists' }), 'sign-up')).toMatchObject({
      code: 'email_taken',
      message: EMAIL_TAKEN_MESSAGE,
    });
    expect(asUserFacing(new Error('Password should be at least 6 characters'), 'sign-up').message).toBe(WEAK_PASSWORD_MESSAGE);
    expect(asUserFacing(new Error('Email not confirmed'), 'sign-in').code).toBe('confirm_email');
    const leaked = asUserFacing(new Error('relation "profiles" does not exist\n    at Module.foo (node_modules/x.ts:4)'), 'thumos');
    expect(leaked.message).not.toMatch(/node_modules|relation/);
    expect(leaked.message).toMatch(/try again/i);
    const js = asUserFacing(new Error("Cannot read property 'randomUUID' of undefined"), 'general');
    expect(js.message).not.toMatch(/randomUUID|undefined|property/i);
    const postgres = asUserFacing(new Error('permission denied for table consents'), 'general');
    expect(postgres.message).not.toMatch(/permission denied|consents/i);
    expect(asUserFacing(new Error('duplicate key value violates unique constraint "consents_pkey"'), 'general').message).not.toMatch(/duplicate|violates/i);
    expect(asUserFacing(new Error('duplicate key value violates unique constraint "interests_slug_key"'), 'general').message).not.toMatch(/duplicate|violates|interests_slug/i);
    expect(asUserFacing(new Error('Set a start date first.'), 'general').message).toBe('Set a start date first.');
    error.mockRestore();
  });

  it('keeps the server reason when a private message fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ambiguous = Object.assign(new Error('column reference "user_id" is ambiguous'), { code: '42702' });
    expect(privateMessageFailure(ambiguous)).toBe('42702: column reference "user_id" is ambiguous');
    expect(privateMessageFailure(new UserFacingError('You cannot message yourself.', 'generic'))).toBe('You cannot message yourself.');
    expect(privateMessageFailure(new UserFacingError('You cannot contact this person.', 'generic'))).toBe('You cannot contact this person.');
    expect(privateMessageFailure(new Error('permission denied for table connections'))).toBe('permission denied for table connections');
    expect(privateMessageFailure(new Error('relation "profiles" does not exist\n    at Module.foo (node_modules/x.ts:4)'))).toBe('relation "profiles" does not exist');
    expect(privateMessageFailure(new Error('failed at Module.foo (node_modules/x.ts:4)'))).toBe('Could not open a private message.');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const connect = repo.slice(repo.indexOf('async requestConnection'), repo.indexOf('async respondConnection'));
    expect(connect).toContain('if (error && !isDuplicateWrite(error)) throw error');
    const open = repo.slice(repo.indexOf('async openPrivateChat'), repo.indexOf('async requestConnection'));
    expect(open).not.toContain(".from('blocks')");
    expect(open).not.toContain('blocks.error');
    const profile = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    expect(profile).toContain('privateMessageFailure');
    expect(profile).toContain('label="Try again"');
    expect(profile).not.toContain("shownError(err, 'Could not open a private message.')");
    error.mockRestore();
  });

  it('says a person cannot be contacted when the server refuses the connection', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refused = Object.assign(
      new Error('new row violates row-level security policy for table "connections"'),
      { code: '42501' },
    );
    expect(privateMessageFailure(refused)).toBe('You cannot contact this person.');
    expect(privateMessageFailure(refused)).not.toMatch(/42501|row-level|connections/i);
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const open = repo.slice(repo.indexOf('async openPrivateChat'), repo.indexOf('async requestConnection'));
    expect(open).not.toContain('select(');
    expect(open).toContain('requestConnection');
    error.mockRestore();
  });
});

describe('idempotent retry', () => {
  it('retries a dropped GET once and does not retry POST', async () => {
    let gets = 0;
    let posts = 0;
    const lost = new Error(LOST);
    const fetch = fetchWithOneRetry(async (_input, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST') {
        posts += 1;
        throw lost;
      }
      gets += 1;
      if (gets === 1) throw new Error('The network connection was lost');
      return new Response('ok', { status: 200 });
    });
    const ok = await fetch('https://example.test/profiles', { method: 'GET' });
    expect(await ok.text()).toBe('ok');
    expect(gets).toBe(2);
    await expect(fetch('https://example.test/auth/v1/signup', { method: 'POST', body: '{}' })).rejects.toThrow(/network connection was lost/);
    expect(posts).toBe(1);
  });

  it('retries one gateway failure on GET and leaves a second failure as the result', async () => {
    let calls = 0;
    const fetch = fetchWithOneRetry(async () => {
      calls += 1;
      return new Response('down', { status: calls === 1 ? 503 : 200 });
    });
    const response = await fetch('https://example.test/resources');
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });
});

describe('password reset redirects', () => {
  it('uses the device deep link and the web origin', () => {
    expect(passwordResetRedirect('native')).toBe('charioteer://set-password');
    expect(passwordResetRedirect('web', 'http://localhost:43127/')).toBe('http://localhost:43127/set-password');
    expect(passwordResetRedirect('web')).toBe('http://127.0.0.1:43127/set-password');
  });

  it('reads tokens or a code only from the set-password link', () => {
    expect(recoveryLink('charioteer://set-password#access_token=aaa&refresh_token=bbb&type=recovery')).toEqual({
      kind: 'tokens',
      accessToken: 'aaa',
      refreshToken: 'bbb',
    });
    expect(recoveryLink('http://127.0.0.1:43127/set-password?code=xyz')).toEqual({ kind: 'code', code: 'xyz' });
    expect(recoveryLink('charioteer://#access_token=aaa&refresh_token=bbb')).toBeNull();
  });

  it('lists the same redirect URLs in the README and the local allow-list', () => {
    const readme = readFileSync('README.md', 'utf8');
    const toml = readFileSync('supabase/config.toml', 'utf8');
    for (const url of PASSWORD_RESET_REDIRECTS) {
      expect(readme).toContain(url);
      expect(toml).toContain(url);
    }
  });
});
