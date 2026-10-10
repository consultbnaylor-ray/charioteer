import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { appleSignInEnabled } from '@/config/publicEnv';
import { useRepository, useSnapshot } from '@/data';
import { crisisHelplines } from '@/data/catalogue';
import { DEMO_PASSWORD } from '@/data/demo-seed';
import { Button, Card, ErrorNote, Field, Mark, Screen, T, Wordmark } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

export default function SignIn() {
  const repo = useRepository();
  const snap = useSnapshot();
  const theme = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helplines = crisisHelplines(snap.resources);

  async function submit(nextEmail: string, nextPassword: string) {
    setPending(true);
    setError(null);
    try {
      await repo.signIn(nextEmail, nextPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen
      title="Hold the reins."
      intro="The Beginning is the Most Important Part of the Work"
      introStyle={{
        fontFamily: theme.font.bodyItalic,
        fontSize: 19 * theme.scale,
        lineHeight: 26 * theme.scale,
        color: theme.colors.ink,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <Mark size={168} />
        <Wordmark size={28} />
      </View>
      <Card>
        <T variant="body">For anyone stepping away from alcohol, and anyone building a clearer, more meaningful life.</T>
      </Card>
      <Pressable accessibilityRole="link" onPress={() => setHelpOpen((open) => !open)}>
        <T variant="body" style={{ color: theme.colors.danger, textDecorationLine: 'underline' }}>Need help now?</T>
      </Pressable>
      {helpOpen ? (
        <Card style={{ borderColor: theme.colors.danger, borderLeftWidth: 3 }}>
          <T>You do not need an account. These lines are free.</T>
          {helplines.map((item) => (
            <View key={item.id}>
              <T variant="label">{item.title}</T>
              <T>{item.detail}</T>
              {item.phone ? (
                <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${item.phone?.replace(/\s/g, '')}`)}>
                  <T style={{ color: theme.colors.danger, fontFamily: theme.font.bodyStrong }}>{item.phone}</T>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
      {snap.mode === 'demo' ? (
        <>
          <Button
            label="Explore the sample account"
            pending={pending}
            onPress={() => submit('alex.hart@example.com', DEMO_PASSWORD)}
          />
          <T variant="muted">Alex Hart, 47 days in, Bristol. Password for the other sample people is the same: {DEMO_PASSWORD}</T>
        </>
      ) : null}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" placeholder="Your password" />
      <ErrorNote>{error}</ErrorNote>
      <Button label="Sign in" pending={pending} onPress={() => submit(email, password)} />
      {appleSignInEnabled() ? (
        <Button label="Sign in with Apple" tone="quiet" onPress={() => {
          setError(null);
          void repo.signInWithApple().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Apple sign-in failed.'));
        }} />
      ) : null}
      <Link href="/sign-up">
        <T variant="body" style={{ textDecorationLine: 'underline' }}>Create an account</T>
      </Link>
    </Screen>
  );
}
