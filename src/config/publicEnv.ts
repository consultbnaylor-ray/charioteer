/**
 * Public client config. These values are safe to ship: the publishable key
 * and the legacy anon key are both public by design. The xAI key is not here.
 */
export const LIVE_SUPABASE_URL = 'https://jvmmuhljklkahebxdsah.supabase.co';

export const LIVE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CjeTAzHc4MrdXb2wDBkMwg_6aYBC34S';

export const LIVE_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bW11aGxqa2xrYWhlYnhkc2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MzI4MTcsImV4cCI6MjEwNzIwODgxN30.jyrAWcidsDfTWTegQWUjGcf-FjqS0aq2CcwzYRNhlYo';

export type PublicEnv = {
  EXPO_PUBLIC_DATA_MODE?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED?: string;
};

export type ClientConfig =
  | { mode: 'demo'; url: ''; key: '' }
  | { mode: 'supabase'; url: string; key: string };

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

function fromProcess(): PublicEnv {
  return {
    EXPO_PUBLIC_DATA_MODE: process.env.EXPO_PUBLIC_DATA_MODE,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED: process.env.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED,
  };
}

/** The Apple button stays hidden until the Supabase provider is actually on. */
export function appleSignInEnabled(env: PublicEnv = fromProcess()): boolean {
  return clean(env.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED) === 'true';
}

/** Demo runs only when EXPO_PUBLIC_DATA_MODE is exactly `demo`. Otherwise the app uses live Supabase. */
export function resolveClientConfig(env: PublicEnv = fromProcess()): ClientConfig {
  if (clean(env.EXPO_PUBLIC_DATA_MODE) === 'demo') return { mode: 'demo', url: '', key: '' };
  const url = clean(env.EXPO_PUBLIC_SUPABASE_URL) || LIVE_SUPABASE_URL;
  const key =
    clean(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    clean(env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
    LIVE_SUPABASE_PUBLISHABLE_KEY;
  return { mode: 'supabase', url, key };
}
