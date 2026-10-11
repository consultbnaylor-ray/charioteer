import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { TextScale, ThemePreference } from '@/data/types';
import { correctedSoberStart } from '@/domain/correctStart';
import { formatUkDate, isoDay, parseIsoDay, startOfLocalDay } from '@/domain/dates';
import { parseDrinkFreeGoal, parseUnitsGoal, showsSoberRecord, STAGE_LABELS, STAGES, SUDDEN_STOP_WARNING, USUAL_WEEK_HELPER, validateStageStep, type Stage } from '@/domain/stage';
import { shownError } from '@/domain/errors';
import { interestChipRemovable, interestChipVisible } from '@/domain/interests';
import { planCustomInterest } from '@/domain/privacy';
import { planReasons, reasonOverLimit } from '@/domain/reasons';
import { profileDetailsDirty, type ProfileFormValues } from '@/domain/profileForm';
import { InterestChip } from '@/ui/InterestChip';
import { ConsentChoices } from '@/ui/ConsentChoices';
import { ProgressPhotos } from '@/ui/ProgressPhotos';
import { UnitsGuide } from '@/ui/UnitsGuide';
import { DateField } from '@/ui/DateField';
import { Button, Card, Choice, ErrorNote, Field, playSavedHaptic, Screen, T } from '@/ui/ui';

export default function Profile() {
  const snap = useSnapshot();
  const repo = useRepository();
  const profile = snap.profile;
  const [name, setName] = useState(profile?.displayName ?? '');
  const [reasons, setReasons] = useState(snap.reasons.map((reason) => reason.body).join('\n'));
  const [town, setTown] = useState(profile?.town ?? '');
  const [spend, setSpend] = useState(profile?.weeklySpendGbp?.toString() ?? '');
  const [units, setUnits] = useState(profile?.weeklyUnits?.toString() ?? '');
  const [customInterest, setCustomInterest] = useState('');
  const [addingInterest, setAddingInterest] = useState(false);
  const addingInterestRef = useRef(false);
  const [community, setCommunity] = useState(profile?.communityVisible ?? false);
  const [health, setHealth] = useState(profile?.consentHealth ?? false);
  const [ai, setAi] = useState(profile?.consentAi ?? false);
  const [confirm, setConfirm] = useState('');
  const [stage, setStage] = useState<Stage>(profile?.stage ?? 'exploring');
  const [soberDate, setSoberDate] = useState(() => profile?.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : startOfLocalDay(new Date()));
  const [plannedQuit, setPlannedQuit] = useState(() => profile?.plannedQuitAt ? parseIsoDay(profile.plannedQuitAt) : startOfLocalDay(new Date()));
  const [quitUnsure, setQuitUnsure] = useState(!profile?.plannedQuitAt);
  const [unitsGoal, setUnitsGoal] = useState(profile?.weeklyUnitsGoal?.toString() ?? '');
  const [drinkFreeGoal, setDrinkFreeGoal] = useState(profile?.drinkFreeDaysGoal?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const savingRef = useRef(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  useEffect(() => {
    if (!savedNote) return;
    const timer = setTimeout(() => setSavedNote(null), 2500);
    return () => clearTimeout(timer);
  }, [savedNote]);

  if (!profile) return null;

  const savedForm: ProfileFormValues = {
    name: profile.displayName,
    town: profile.town ?? '',
    spend: profile.weeklySpendGbp?.toString() ?? '',
    units: profile.weeklyUnits?.toString() ?? '',
    reasons: snap.reasons.map((reason) => reason.body).join('\n'),
    community: profile.communityVisible,
    health: profile.consentHealth,
    ai: profile.consentAi,
    stage: profile.stage,
    soberDay: profile.sobrietyStartedAt ? isoDay(new Date(profile.sobrietyStartedAt)) : isoDay(soberDate),
    plannedQuit: profile.plannedQuitAt ?? isoDay(plannedQuit),
    quitUnsure: !profile.plannedQuitAt,
    unitsGoal: profile.weeklyUnitsGoal?.toString() ?? '',
    drinkFreeGoal: profile.drinkFreeDaysGoal?.toString() ?? '',
  };
  const dirty = profileDetailsDirty({
    name,
    town,
    spend,
    units,
    reasons,
    community,
    health,
    ai,
    stage,
    soberDay: isoDay(soberDate),
    plannedQuit: isoDay(plannedQuit),
    quitUnsure,
    unitsGoal,
    drinkFreeGoal,
  }, savedForm);

  const themes: ThemePreference[] = ['system', 'light', 'dark'];
  const scales: { id: TextScale; label: string }[] = [
    { id: 'default', label: 'Default' },
    { id: 'large', label: 'Large' },
    { id: 'extra', label: 'Extra large' },
  ];

  function toggleInterest(id: string, selected: boolean) {
    setError(null);
    void repo.setInterestSelected(id, selected).catch((err: unknown) => setError(shownError(err, 'Could not update that interest.')));
  }

  async function addOwnInterest() {
    if (addingInterestRef.current || !profile) return;
    const plan = planCustomInterest(customInterest);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    const known = snap.interests.find((item) => item.slug === plan.slug);
    if (known && profile.interestIds.includes(known.id)) {
      setCustomInterest('');
      setError(null);
      return;
    }
    addingInterestRef.current = true;
    setAddingInterest(true);
    setError(null);
    try {
      if (known) await repo.setInterestSelected(known.id, true);
      else await repo.addCustomInterest(plan.label);
      setCustomInterest('');
    } catch (err) {
      setError(shownError(err, 'Could not add that interest.'));
    } finally {
      addingInterestRef.current = false;
      setAddingInterest(false);
    }
  }

  async function saveDetails() {
    if (!profile || pending || savingRef.current || !dirty) return;
    savingRef.current = true;
    setError(null);
    setMessage(null);
    setSavedNote(null);
    try {
      if (!name.trim()) {
        setError('Add your name.');
        return;
      }
      const weeklySpendGbp = Number(spend);
      const weeklyUnits = Number(units);
      if (!Number.isFinite(weeklySpendGbp) || weeklySpendGbp < 0 || !Number.isFinite(weeklyUnits) || weeklyUnits < 0) {
        setError('Spend and units need to be zero or more.');
        return;
      }
      const stageError = validateStageStep({
        stage,
        soberDay: isoDay(soberDate),
        today: isoDay(new Date()),
        plannedQuit: isoDay(plannedQuit),
        quitUnsure,
        unitsGoal,
        drinkFreeGoal,
      });
      if (stageError) {
        setError(stageError);
        return;
      }
      const plannedReasons = planReasons(reasons.split('\n'));
      if (reasonOverLimit(plannedReasons)) {
        setError('Keep each reason to 280 characters.');
        return;
      }
      setPending(true);
      const parsedUnits = parseUnitsGoal(unitsGoal);
      const parsedDays = parseDrinkFreeGoal(drinkFreeGoal);
      await repo.updateProfile({
        displayName: name.trim(),
        town,
        weeklySpendGbp,
        weeklyUnits,
        stage,
        sobrietyStartedAt: stage === 'stopped' ? correctedSoberStart(soberDate, profile.sobrietyStartedAt) : null,
        plannedQuitAt: stage === 'trying_to_stop' && !quitUnsure ? isoDay(plannedQuit) : null,
        weeklyUnitsGoal: stage === 'cutting_down' && parsedUnits.ok ? parsedUnits.value : null,
        drinkFreeDaysGoal: stage === 'cutting_down' && parsedDays.ok ? parsedDays.value : null,
      });
      await repo.setReasons(plannedReasons);
      await repo.saveConsents({ communityVisible: community, consentHealth: health, consentAi: ai });
      setReasons(plannedReasons.join('\n'));
      setSavedNote('Saved');
      playSavedHaptic();
    } catch (err) {
      setError(shownError(err, 'Could not save.'));
    } finally {
      savingRef.current = false;
      setPending(false);
    }
  }

  async function download() {
    setError(null);
    try {
      const data = await repo.exportData();
      const text = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
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
    <Screen
      eyebrow="You"
      title={profile.displayName}
      intro={profile.email}
      footer={(
        <View style={{ gap: 8 }}>
          {savedNote ? <T>{savedNote}</T> : null}
          <Button label="Save your details" pending={pending} disabled={!dirty || pending} onPress={() => void saveDetails()} />
        </View>
      )}
    >
      <T variant="label">Your details</T>
      <T>Name, where you are, the sober date, your usual week, reasons, interests, town, and consents. A new sober date is a correction, not a relapse.</T>
      <Card>
        <Field label="Name" value={name} onChangeText={setName} placeholder="What should we call you?" />
        <T variant="label">Where you are</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {STAGES.map((item) => (
            <Choice key={item} label={STAGE_LABELS[item]} selected={stage === item} onPress={() => setStage(item)} />
          ))}
        </View>
        {stage === 'stopped' ? <DateField label="Sober since" value={soberDate} onChange={setSoberDate} maximumDate={new Date()} hint="Today or an earlier day. Saving this does not record a relapse." /> : null}
        {stage === 'trying_to_stop' ? (
          <View style={{ gap: 8 }}>
            <T>{SUDDEN_STOP_WARNING}</T>
            <Choice label="Not sure yet" selected={quitUnsure} onPress={() => setQuitUnsure(true)} />
            <Choice label="Pick a date" selected={!quitUnsure} onPress={() => setQuitUnsure(false)} />
            {quitUnsure ? null : <DateField label="Planned quit date" value={plannedQuit} onChange={setPlannedQuit} earliestDate={new Date()} />}
          </View>
        ) : null}
        {stage === 'cutting_down' ? (
          <View style={{ gap: 8 }}>
            <Field label="Weekly units goal" value={unitsGoal} onChangeText={setUnitsGoal} keyboardType="decimal-pad" placeholder="Optional" />
            <Field label="Drink-free days a week" value={drinkFreeGoal} onChangeText={setDrinkFreeGoal} keyboardType="number-pad" placeholder="0 to 7, optional" />
          </View>
        ) : null}
        <T variant="muted">{USUAL_WEEK_HELPER}</T>
        <Field label="Typical spend per week (£)" value={spend} onChangeText={setSpend} keyboardType="decimal-pad" />
        <Field label="Typical units per week" value={units} onChangeText={setUnits} keyboardType="decimal-pad" />
        <UnitsGuide onChange={setUnits} stage={stage} weeklySpend={spend} currentUnits={units} />
        <Field label="Town or area" value={town} onChangeText={setTown} placeholder="Bristol, or leave blank" />
        <Field label="Reasons, one per line" value={reasons} onChangeText={setReasons} multiline />
        <T variant="label">Interests</T>
        <T variant="muted">Tap a chip to add or remove it. Changes save straight away.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {snap.interests.filter((interest) => interestChipVisible(interest, profile.interestIds.includes(interest.id))).map((interest) => {
            const selected = profile.interestIds.includes(interest.id);
            const removable = interestChipRemovable(interest);
            return (
              <InterestChip
                key={interest.id}
                label={interest.label}
                selected={selected}
                custom={removable}
                onPress={() => toggleInterest(interest.id, !selected)}
                onRemove={removable ? () => toggleInterest(interest.id, false) : undefined}
              />
            );
          })}
        </View>
        <Field
          label="Add your own interest"
          value={customInterest}
          onChangeText={setCustomInterest}
          placeholder="Climbing, choir, five-a-side…"
          editable={!addingInterest}
          maxLength={40}
        />
        <Button
          label="Add"
          pending={addingInterest}
          disabled={addingInterest || !customInterest.trim()}
          onPress={() => void addOwnInterest()}
        />
        <T variant="label">Consent</T>
        <ConsentChoices community={community} health={health} ai={ai} onCommunity={setCommunity} onHealth={setHealth} onAi={setAi} />
      </Card>
      <ProgressPhotos />
      <Card>
        <T variant="label">Appearance</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {themes.map((item) => (
            <Choice key={item} label={item === 'system' ? 'Match device' : item === 'light' ? 'Light' : 'Dark'} selected={profile.themePreference === item} onPress={() => void repo.updateProfile({ themePreference: item }).catch((err: unknown) => setError(shownError(err, 'Could not save.')))} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {scales.map((item) => (
            <Choice key={item.id} label={item.label} selected={profile.textScale === item.id} onPress={() => void repo.updateProfile({ textScale: item.id }).catch((err: unknown) => setError(shownError(err, 'Could not save.')))} />
          ))}
        </View>
      </Card>
      {profile.isModerator ? (
        <Card>
          <T variant="label">Moderation queue</T>
          {snap.reports.length === 0 ? <T variant="muted">No reports.</T> : null}
          {snap.reports.map((report) => (
            <View key={report.id} style={{ gap: 4, marginTop: 8 }}>
              <T>{report.reportedName} — {report.reason} ({report.status})</T>
              <T variant="muted">{formatUkDate(report.createdAt)}</T>
              {report.details ? <T variant="muted">{report.details}</T> : null}
              {report.status === 'open' ? <Button label="Mark reviewed" tone="quiet" onPress={() => void repo.reviewReport(report.id).catch((err: unknown) => setError(shownError(err, 'Could not save.')))} /> : null}
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <T variant="label">Reports you have sent</T>
          {snap.reports.length === 0 ? <T variant="muted">None.</T> : snap.reports.map((report) => (
            <T key={report.id}>{report.reportedName}: {report.reason} · {report.status} · {formatUkDate(report.createdAt)}</T>
          ))}
        </Card>
      )}
      <Card>
        <T variant="label">Download</T>
        <T>The file is the stored record. Dates on this screen stay in UK form.</T>
        {showsSoberRecord(profile.stage) && profile.sobrietyStartedAt ? <T variant="muted">Sober since {formatUkDate(profile.sobrietyStartedAt)}.</T> : null}
        <Button label="Download my data" tone="quiet" onPress={() => void download()} />
      </Card>
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
              if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
            });
          }}
        />
      ) : null}
      <Button label="Sign out" tone="quiet" onPress={() => void repo.signOut().catch((err: unknown) => setError(shownError(err, 'Could not sign out.')))} />
      {message ? <T variant="muted">{message}</T> : null}
      <ErrorNote>{error}</ErrorNote>
      <T variant="muted">Charioteer is operated by Quantica Labs Ltd in the UK. Ben Naylor is the owner. Deleting the account removes the profile and the data tied to it.</T>
    </Screen>
  );
}
