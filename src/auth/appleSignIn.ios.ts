import * as AppleAuthentication from 'expo-apple-authentication';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function signInWithApple(client: SupabaseClient): Promise<void> {
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) throw new Error('Sign in with Apple is not available on this device.');
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
  const { error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw new Error(error.message);
}
