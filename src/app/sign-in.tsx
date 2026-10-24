import { Link, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { APP_FULL_NAME } from '@/domain/appName';
import { appleSignInEnabled } from '@/config/publicEnv';
import { useRepository, useSnapshot } from '@/data';
import { crisisHelplines } from '@/data/catalogue';
import { DEMO_PASSWORD } from '@/data/demo-seed';
import { RESET_SENT_MESSAGE, asUserFacing } from '@/domain/errors';
import { Button, Card, ErrorNote, Field, Mark, Screen, T, Wordmark } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function SignIn() {
  const repo = useRepository();
  const snap = useSnapshot();
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const [email, setEmail] = useState(() => firstParam(params.email));
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helplines = crisisHelplines(snap.resources);

  useEffect(() => {
    const next = firstParam(params.email);
    if (next) setEmail(next);
  }, [params.email]);

  async function submit(nextEmail: string, nextPassword: string) {
    setPending(true);
    setError(null);
    try {
      await repo.signIn(nextEmail, nextPassword);
    } catch (err) {
      setError(asUserFacing(err, 'sign-in').message);
    } finally {
      setPending(false);
    }
  }

  async function sendReset() {
    setError(null);
    setNotice(null);
    setResetPending(true);
    try {
      await repo.requestPasswordReset(email);
      setNotice(RESET_SENT_MESSAGE);
    } catch (err) {
      setError(asUserFacing(err, 'reset').message);
    } finally {
      setResetPending(false);
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
        <View style={{ gap: 4, flexShrink: 1 }}>
          <Wordmark size={28} />
          <T variant="muted">{APP_FULL_NAME}</T>
        </View>
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
      <Pressable accessibilityRole="button" accessibilityLabel="Forgot password?" onPress={() => void sendReset()} disabled={pending || resetPending}>
        <T variant="body" style={{ textDecorationLine: 'underline' }}>Forgot password?</T>
      </Pressable>
      <ErrorNote>{error}</ErrorNote>
      {notice ? <T variant="muted">{notice}</T> : null}
      <Button label="Sign in" pending={pending} onPress={() => submit(email, password)} />
      {appleSignInEnabled() ? (
        <Button label="Sign in with Apple" tone="quiet" onPress={() => {
          setError(null);
          setNotice(null);
          void repo.signInWithApple().catch((err: unknown) => setError(asUserFacing(err, 'sign-in').message));
        }} />
      ) : null}
      <Link href="/sign-up">
        <T variant="body" style={{ textDecorationLine: 'underline' }}>Create an account</T>
      </Link>
    </Screen>
  );
}
