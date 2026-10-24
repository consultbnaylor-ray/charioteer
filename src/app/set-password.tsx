import { Link, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { asUserFacing } from '@/domain/errors';
import { Button, ErrorNote, Field, Screen, T } from '@/ui/ui';

export default function SetPassword() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [linkChecked, setLinkChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function open(url: string | null) {
      if (!url || !url.includes('set-password')) return;
      try {
        await repo.completeAuthRedirect(url);
      } catch (err) {
        if (!cancelled) setError(asUserFacing(err, 'reset').message);
      }
    }
    async function start() {
      if (Platform.OS === 'web' && typeof window !== 'undefined') await open(window.location.href);
      await open(await Linking.getInitialURL());
      if (!cancelled) setLinkChecked(true);
    }
    void start();
    const subscription = Linking.addEventListener('url', (event) => {
      void open(event.url);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [repo]);

  async function save() {
    setError(null);
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setPending(true);
    try {
      await repo.updatePassword(password);
      router.replace('/home');
    } catch (err) {
      setError(asUserFacing(err, 'reset').message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen
      eyebrow="Password"
      title="Set a new password."
      intro="Choose at least 8 characters. You will use it the next time you sign in."
    >
      {snap.session ? (
        <>
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" placeholder="New password" />
          <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" placeholder="Repeat the password" />
          <ErrorNote>{error}</ErrorNote>
          <Button label="Save password" pending={pending} onPress={() => void save()} />
        </>
      ) : (
        <>
          <T>{linkChecked ? 'Open the reset link from your email on this phone. It brings you back here to choose a password.' : 'Opening the link…'}</T>
          <ErrorNote>{error}</ErrorNote>
          <Link href="/sign-in"><T variant="body" style={{ textDecorationLine: 'underline' }}>Back to sign in</T></Link>
        </>
      )}
    </Screen>
  );
}
