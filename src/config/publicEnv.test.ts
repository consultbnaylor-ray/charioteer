import { describe, expect, it } from 'vitest';

import {
  LIVE_SUPABASE_ANON_KEY,
  LIVE_SUPABASE_PUBLISHABLE_KEY,
  LIVE_SUPABASE_URL,
  appleSignInEnabled,
  resolveClientConfig,
} from './publicEnv';

describe('public client config', () => {
  it('points at the live project when nothing is set', () => {
    expect(resolveClientConfig({})).toEqual({
      mode: 'supabase',
      url: LIVE_SUPABASE_URL,
      key: LIVE_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it('keeps demo mode behind an explicit flag', () => {
    expect(resolveClientConfig({ EXPO_PUBLIC_DATA_MODE: 'demo', EXPO_PUBLIC_SUPABASE_URL: LIVE_SUPABASE_URL }).mode).toBe('demo');
    expect(resolveClientConfig({ EXPO_PUBLIC_DATA_MODE: 'supabase' }).mode).toBe('supabase');
    expect(resolveClientConfig({ EXPO_PUBLIC_DATA_MODE: '' }).mode).toBe('supabase');
  });

  it('prefers an explicit publishable key, then the legacy anon key', () => {
    expect(
      resolveClientConfig({
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: LIVE_SUPABASE_ANON_KEY,
      }).key,
    ).toBe('sb_publishable_test');
    expect(resolveClientConfig({ EXPO_PUBLIC_SUPABASE_ANON_KEY: LIVE_SUPABASE_ANON_KEY }).key).toBe(LIVE_SUPABASE_ANON_KEY);
  });

  it('hides Sign in with Apple unless the public flag is exactly true', () => {
    expect(appleSignInEnabled({})).toBe(false);
    expect(appleSignInEnabled({ EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED: 'false' })).toBe(false);
    expect(appleSignInEnabled({ EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED: 'TRUE' })).toBe(false);
    expect(appleSignInEnabled({ EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED: 'true' })).toBe(true);
  });
});
