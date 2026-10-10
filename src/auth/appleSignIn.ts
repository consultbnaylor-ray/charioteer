import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Web and Android. The iOS file uses the native Apple sheet. */
export async function signInWithApple(client: SupabaseClient): Promise<void> {
  const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'charioteer://';
  const { error } = await client.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo },
  });
  if (error) throw new Error(error.message);
}
