import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useRepository } from '@/data';
import { DEMO_PASSWORD } from '@/data/demo-seed';
import { Button, Card, ErrorNote, Field, Mark, Screen, T } from '@/ui/ui';

export default function SignIn() {
  const repo = useRepository();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    <Screen eyebrow="Charioteer" title="Hold the reins." intro="A quieter place to stay sober, or simply to live with a bit more care. Thumos is the spirited horse: courage, not a telling-off.">
      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Mark />
          <T variant="body">For anyone stepping back from alcohol, and anyone building a clearer life.</T>
        </View>
      </Card>
      <Button
        label="Explore the sample account"
        tone="sage"
        pending={pending}
        onPress={() => submit('alex.hart@example.com', DEMO_PASSWORD)}
      />
      <T variant="muted">Alex Hart, 47 days in, Bristol. Password for the other sample people is the same: {DEMO_PASSWORD}</T>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" />
      <ErrorNote>{error}</ErrorNote>
      <Button label="Sign in" pending={pending} onPress={() => submit(email, password)} />
      <Button label="Sign in with Apple" tone="quiet" onPress={() => {
        setError(null);
        void repo.signInWithApple().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Apple sign-in failed.'));
      }} />
      <Link href="/sign-up">
        <T variant="body" style={{ textDecorationLine: 'underline' }}>Create an account</T>
      </Link>
    </Screen>
  );
}
