import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { TextScale, ThemePreference } from '@/data/types';
import { shownError } from '@/domain/errors';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

export default function Profile() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const profile = snap.profile;
  const [reasons, setReasons] = useState(snap.reasons.map((reason) => reason.body).join('\n'));
  const [town, setTown] = useState(profile?.town ?? '');
  const [spend, setSpend] = useState(profile?.weeklySpendGbp?.toString() ?? '');
  const [units, setUnits] = useState(profile?.weeklyUnits?.toString() ?? '');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!profile) return null;

  const themes: ThemePreference[] = ['system', 'light', 'dark'];
  const scales: { id: TextScale; label: string }[] = [
    { id: 'default', label: 'Default' },
    { id: 'large', label: 'Large' },
    { id: 'extra', label: 'Extra large' },
  ];

  async function saveBasics() {
    setError(null);
    const weeklySpendGbp = Number(spend);
    const weeklyUnits = Number(units);
    if (!Number.isFinite(weeklySpendGbp) || weeklySpendGbp < 0 || !Number.isFinite(weeklyUnits) || weeklyUnits < 0) {
      setError('Spend and units need to be zero or more.');
      return;
    }
    try {
      await repo.updateProfile({ town, weeklySpendGbp, weeklyUnits });
      await repo.setReasons(reasons.split('\n'));
      setMessage('Saved.');
    } catch (err) {
      setError(shownError(err, 'Could not save.'));
    }
  }

  async function download() {
    setError(null);
    try {
      const data = await repo.exportData();
      const text = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'charioteer-export.json';
        anchor.click();
        URL.revokeObjectURL(url);
        setMessage('Download started.');
        return;
      }
      await Share.share({ message: text });
    } catch (err) {
      setError(shownError(err, 'Could not export.'));
    }
  }

  return (
    <Screen eyebrow="You" title={profile.displayName} intro={profile.email}>
      <Card>
        <T variant="label">Appearance</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {themes.map((item) => (
            <Choice key={item} label={item === 'system' ? 'Match device' : item === 'light' ? 'Light' : 'Dark'} selected={profile.themePreference === item} onPress={() => void repo.updateProfile({ themePreference: item })} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {scales.map((item) => (
            <Choice key={item.id} label={item.label} selected={profile.textScale === item.id} onPress={() => void repo.updateProfile({ textScale: item.id })} />
          ))}
        </View>
      </Card>
      <Field label="Town or area" value={town} onChangeText={setTown} />
      <Field label="Typical spend per week (£)" value={spend} onChangeText={setSpend} keyboardType="decimal-pad" />
      <Field label="Typical units per week" value={units} onChangeText={setUnits} keyboardType="decimal-pad" />
      <Field label="Reasons, one per line" value={reasons} onChangeText={setReasons} multiline />
      <Button label="Save" onPress={() => void saveBasics()} />
      <Card>
        <T variant="label">Interests</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {snap.interests.filter((interest) => !interest.custom || profile.interestIds.includes(interest.id)).map((interest) => (
            <Choice
              key={interest.id}
              label={interest.label}
              selected={profile.interestIds.includes(interest.id)}
              onPress={() => {
                const next = profile.interestIds.includes(interest.id)
                  ? profile.interestIds.filter((id) => id !== interest.id)
                  : [...profile.interestIds, interest.id];
                void repo.updateProfile({ interestIds: next });
              }}
            />
          ))}
        </View>
      </Card>
      <Card>
        <T variant="label">Consent</T>
        <T variant="muted">Health data {profile.consentHealth ? 'on' : 'off'} · Coach {profile.consentAi ? 'on' : 'off'} · Community {profile.communityVisible ? 'on' : 'off'}</T>
        <Button label={profile.consentHealth ? 'Turn health data off' : 'Allow health data'} tone="quiet" onPress={() => void repo.updateProfile({ consentHealth: !profile.consentHealth })} />
        <Button label={profile.consentAi ? 'Turn the coach off' : 'Allow the coach'} tone="quiet" onPress={() => void repo.updateProfile({ consentAi: !profile.consentAi })} />
        <Button label={profile.communityVisible ? 'Hide me from community' : 'Show me in community'} tone="quiet" onPress={() => void repo.updateProfile({ communityVisible: !profile.communityVisible })} />
        <Button label="Health readings" tone="quiet" onPress={() => router.push('/health' as never)} />
      </Card>
      {profile.isModerator ? (
        <Card>
          <T variant="label">Moderation queue</T>
          {snap.reports.length === 0 ? <T variant="muted">No reports.</T> : null}
          {snap.reports.map((report) => (
            <View key={report.id} style={{ gap: 4, marginTop: 8 }}>
              <T>{report.reportedName} — {report.reason} ({report.status})</T>
              {report.details ? <T variant="muted">{report.details}</T> : null}
              {report.status === 'open' ? <Button label="Mark reviewed" tone="quiet" onPress={() => void repo.reviewReport(report.id)} /> : null}
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <T variant="label">Reports you have sent</T>
          {snap.reports.length === 0 ? <T variant="muted">None.</T> : snap.reports.map((report) => (
            <T key={report.id}>{report.reportedName}: {report.reason} · {report.status}</T>
          ))}
        </Card>
      )}
      <Button label="Download my data" tone="quiet" onPress={() => void download()} />
      <Field label="Type DELETE to remove the account" value={confirm} onChangeText={setConfirm} />
      <Button
        label="Delete account and data"
        tone="sos"
        disabled={confirm !== 'DELETE'}
        onPress={() => {
          void repo.deleteAccount().catch((err: unknown) => setError(shownError(err, 'Could not delete the account.')));
        }}
      />
      {snap.mode === 'demo' ? (
        <Button
          label="Reset sample data"
          tone="quiet"
          onPress={() => {
            void AsyncStorage.removeItem('charioteer.demo.v1').then(() => {
              if (Platform.OS === 'web') window.location.reload();
            });
          }}
        />
      ) : null}
      <Button label="Sign out" tone="quiet" onPress={() => void repo.signOut()} />
      {message ? <T variant="muted">{message}</T> : null}
      <ErrorNote>{error}</ErrorNote>
      <T variant="muted">Charioteer is operated by Quantica Labs Ltd in the UK. Ben Naylor is the owner. Deleting the account removes the profile and the data tied to it.</T>
    </Screen>
  );
}
