import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { OFFLINE_MESSAGE, SIGN_IN_FIRST } from './errors';
import { resolveSignedInSession } from './liveSession';
import type { SessionTicket } from './edgeRetry';

const NOW = Date.parse('2026-10-20T09:00:00.000Z');

function ticket(overrides: Partial<SessionTicket> = {}): SessionTicket {
  return {
    accessToken: 'access-token',
    expiresAt: Math.floor(NOW / 1000) + 3600,
    userId: 'user-1',
    ...overrides,
  };
}

describe('resolveSignedInSession', () => {
  it('uses a current session and does not refresh it', async () => {
    const refresh = vi.fn();
    const resolved = await resolveSignedInSession({
      read: async () => ({ ticket: ticket(), error: null }),
      refresh,
      now: NOW,
    });
    expect(resolved).toEqual({ userId: 'user-1', accessToken: 'access-token' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and returns the new session', async () => {
    const refresh = vi.fn(async () => ({
      ticket: ticket({ accessToken: 'fresh-token', expiresAt: Math.floor(NOW / 1000) + 3600 }),
      error: null,
    }));
    const resolved = await resolveSignedInSession({
      read: async () => ({
        ticket: ticket({ accessToken: 'stale-token', expiresAt: Math.floor(NOW / 1000) - 30 }),
        error: null,
      }),
      refresh,
      now: NOW,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(resolved).toEqual({ userId: 'user-1', accessToken: 'fresh-token' });
  });

  it('reports signed out only when there is no session', async () => {
    const resolved = await resolveSignedInSession({
      read: async () => ({ ticket: ticket({ accessToken: null, expiresAt: null, userId: null }), error: null }),
      refresh: async () => ({ ticket: ticket({ accessToken: null, expiresAt: null, userId: null }), error: new Error('Auth session missing!') }),
      now: NOW,
    });
    expect(resolved).toEqual({ failure: 'signed-out' });
  });

  it('keeps a known user as a connection problem when the refresh cannot reach the network', async () => {
    const resolved = await resolveSignedInSession({
      read: async () => ({
        ticket: ticket({ expiresAt: Math.floor(NOW / 1000) - 30 }),
        error: new TypeError('Network request failed'),
      }),
      refresh: async () => ({
        ticket: ticket({ accessToken: null, expiresAt: null }),
        error: new TypeError('Network request failed'),
      }),
      knownUserId: 'user-1',
      now: NOW,
    });
    expect(resolved).toEqual({ failure: 'connection' });
  });
});

describe('health writes use the live session', () => {
  const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');

  it('reads getSession and refreshes an expired token instead of getUser', () => {
    const userId = repo.slice(repo.indexOf('private async userId'), repo.indexOf('async signIn'));
    expect(userId).toContain('this.signedIn()');
    expect(userId).not.toContain('getUser(');
    const access = repo.slice(repo.indexOf('private async accessToken'), repo.indexOf('private async signedIn'));
    expect(access).toContain('this.signedIn()');
    expect(access).not.toContain('getUser(');
    const signed = repo.slice(repo.indexOf('private async signedIn'), repo.indexOf('private sessionTicket'));
    expect(signed).toContain('auth.getSession()');
    expect(signed).toContain('auth.refreshSession()');
    expect(signed).toContain('SIGN_IN_FIRST');
    expect(signed).toContain('OFFLINE_MESSAGE');
    expect(signed).not.toContain('getUser(');
    const save = repo.slice(repo.indexOf('async saveHealth'), repo.indexOf('async setInterestSelected'));
    expect(save).toContain('this.userId()');
    expect(SIGN_IN_FIRST).toBe('Sign in first.');
    expect(OFFLINE_MESSAGE).toContain('connection');
    const logged = repo.slice(repo.indexOf('async logClientError'), repo.indexOf('async saveDeviceToken'));
    expect(logged).not.toContain('this.userId()');
    expect(logged).not.toContain('getUser(');
  });
});
