import { Link, useRouter } from 'expo-router';
import { useState } from 'react';

import { useRepository } from '@/data';
import { APP_FULL_NAME } from '@/domain/appName';
import { asUserFacing } from '@/domain/errors';
import { Button, ErrorNote, Field, Screen, T } from '@/ui/ui';

export default function SignUp() {
  const repo = useRepository();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [offerSignIn, setOfferSignIn] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Screen eyebrow="New account" title="Start where you are." intro={`You will choose a sober date, your reasons, and what ${APP_FULL_NAME} is allowed to keep. Nothing is shared until you say so.`}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="What should we call you?" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" hint="At least 8 characters." />
      <ErrorNote>{error}</ErrorNote>
      {offerSignIn ? (
        <Button
          label="Sign in instead"
          tone="quiet"
          onPress={() => router.push({ pathname: '/sign-in', params: { email: email.trim() } })}
        />
      ) : null}
      <Button
        label="Create account"
        pending={pending}
        onPress={() => {
          setPending(true);
          setError(null);
          setOfferSignIn(false);
          void repo.signUp(email, password, name).catch((err: unknown) => {
            const faced = asUserFacing(err, 'sign-up');
            setError(faced.message);
            setOfferSignIn(faced.code === 'email_taken' || faced.code === 'confirm_email');
          }).finally(() => setPending(false));
        }}
      />
      <Link href="/sign-in"><T variant="body" style={{ textDecorationLine: 'underline' }}>I already have an account</T></Link>
    </Screen>
  );
}
