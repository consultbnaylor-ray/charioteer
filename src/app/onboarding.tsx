import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { isoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { interestChipVisible } from '@/domain/interests';
import { planCustomInterest, validateTown } from '@/domain/privacy';
import { reasonPlaceholder } from '@/domain/reasons';
import { parseDrinkFreeGoal, parseUnitsGoal, STAGE_LABELS, STAGES, SUDDEN_STOP_WARNING, USUAL_WEEK_HELPER, validateStageStep, type Stage } from '@/domain/stage';
import { ConsentChoices } from '@/ui/ConsentChoices';
import { DateField } from '@/ui/DateField';
import { UnitsGuide } from '@/ui/UnitsGuide';
import { Button, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

const STEPS = 8;

function daysAgo(days: number): Date {
  const date = startOfLocalDay(new Date());
  date.setDate(date.getDate() - days);
  return date;
}

function toInstant(day: Date): string {
  const chosen = startOfLocalDay(day);
  const now = new Date();
  if (isoDay(chosen) === isoDay(now)) return now.toISOString();
  return chosen.toISOString();
}

export default function Onboarding() {
  const repo = useRepository();
  const snap = useSnapshot();
  const theme = useAppTheme();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(snap.profile?.displayName ?? '');
  const [adult, setAdult] = useState<boolean | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [start, setStart] = useState(() => startOfLocalDay(new Date()));
  const [plannedQuit, setPlannedQuit] = useState(() => startOfLocalDay(new Date()));
  const [quitUnsure, setQuitUnsure] = useState(true);
  const [unitsGoal, setUnitsGoal] = useState('');
  const [drinkFreeGoal, setDrinkFreeGoal] = useState('');
  const [reasons, setReasons] = useState(['', '', '']);
  const [spend, setSpend] = useState('40');
  const [units, setUnits] = useState('20');
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [town, setTown] = useState('');
  const [community, setCommunity] = useState(false);
  const [health, setHealth] = useState(false);
  const [ai, setAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [addingInterest, setAddingInterest] = useState(false);
  const addingInterestRef = useRef(false);

  function toggleInterest(id: string) {
    setInterestIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function selectInterest(id: string) {
    setInterestIds((current) => (current.includes(id) ? current : [...current, id]));
    setCustom('');
  }

  async function addInterest() {
    if (addingInterestRef.current) return;
    const plan = planCustomInterest(custom);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    const known = repo.getSnapshot().interests.find((item) => item.slug === plan.slug);
    if (known) {
      setError(null);
      selectInterest(known.id);
      return;
    }
    addingInterestRef.current = true;
    setAddingInterest(true);
    setError(null);
    try {
      await repo.addCustomInterest(plan.label);
      const match = repo.getSnapshot().interests.find((item) => item.slug === plan.slug);
      if (match) selectInterest(match.id);
      else setCustom('');
    } catch (err) {
      setError(shownError(err, 'Could not add that.'));
    } finally {
      addingInterestRef.current = false;
      setAddingInterest(false);
    }
  }

  async function finish() {
    const townError = validateTown(town);
    if (townError) {
      setError(townError);
      return;
    }
    const weeklySpendGbp = Number(spend);
    const weeklyUnits = Number(units);
    if (!Number.isFinite(weeklySpendGbp) || weeklySpendGbp < 0 || !Number.isFinite(weeklyUnits) || weeklyUnits < 0) {
      setError('Spend and units need to be zero or more.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const units = parseUnitsGoal(unitsGoal);
      const days = parseDrinkFreeGoal(drinkFreeGoal);
      await repo.completeOnboarding({
        displayName: name,
        stage: stage ?? 'exploring',
        sobrietyStartedAt: stage === 'stopped' ? toInstant(start) : null,
        plannedQuitAt: stage === 'trying_to_stop' && !quitUnsure ? isoDay(plannedQuit) : null,
        weeklyUnitsGoal: stage === 'cutting_down' && units.ok ? units.value : null,
        drinkFreeDaysGoal: stage === 'cutting_down' && days.ok ? days.value : null,
        reasons,
        weeklySpendGbp,
        weeklyUnits,
        interestIds,
        town,
        communityVisible: community,
        consentHealth: health,
        consentAi: ai,
      });
    } catch (err) {
      setError(shownError(err, 'Could not save.'));
    } finally {
      setPending(false);
    }
  }

  const catalogue = snap.interests.filter((interest) => interestChipVisible(interest, interestIds.includes(interest.id)));

  return (
    <Screen eyebrow={`Step ${step + 1} of ${STEPS}`} title={titles[step]} intro={intros[step]}>
      {step === 0 ? <Field label="Your name" value={name} onChangeText={setName} placeholder="Alex" /> : null}
      {step === 1 ? (
        <View style={{ gap: 10 }}>
          <Button label="I am 18 or over" tone={adult === true ? 'primary' : 'quiet'} onPress={() => setAdult(true)} />
          <Button label="I am under 18" tone={adult === false ? 'primary' : 'quiet'} onPress={() => setAdult(false)} />
          {adult === false ? (
            <T>Charioteer is only for adults. If you are worried about your own or someone else’s drinking, an adult can help you contact Drinkline on 0300 123 1110, or the Samaritans on 116 123.</T>
          ) : null}
        </View>
      ) : null}
      {step === 2 ? (
        <View style={{ gap: 10 }}>
          {STAGES.map((item) => (
            <Choice key={item} label={STAGE_LABELS[item]} selected={stage === item} onPress={() => setStage(item)} />
          ))}
          {stage === 'stopped' ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Choice label="Today" selected={isoDay(start) === isoDay(new Date())} onPress={() => setStart(startOfLocalDay(new Date()))} />
                <Choice label="Yesterday" selected={isoDay(start) === isoDay(daysAgo(1))} onPress={() => setStart(daysAgo(1))} />
                <Choice label="A week ago" selected={isoDay(start) === isoDay(daysAgo(7))} onPress={() => setStart(daysAgo(7))} />
              </View>
              <DateField label="Or a date" value={start} onChange={setStart} maximumDate={new Date()} hint="Use the day you stopped, or today if you are starting now." />
            </View>
          ) : null}
          {stage === 'trying_to_stop' ? (
            <View style={{ gap: 10 }}>
              <T>{SUDDEN_STOP_WARNING}</T>
              <Choice label="Not sure yet" selected={quitUnsure} onPress={() => setQuitUnsure(true)} />
              <Choice label="Pick a date" selected={!quitUnsure} onPress={() => setQuitUnsure(false)} />
              {quitUnsure ? null : (
                <DateField label="Planned quit date" value={plannedQuit} onChange={setPlannedQuit} earliestDate={new Date()} hint="Today or a later day." />
              )}
            </View>
          ) : null}
          {stage === 'cutting_down' ? (
            <View style={{ gap: 10 }}>
              <Field label="Weekly units goal, if you want one" value={unitsGoal} onChangeText={setUnitsGoal} keyboardType="decimal-pad" placeholder="Optional" />
              <Field label="Drink-free days a week, if you want a number" value={drinkFreeGoal} onChangeText={setDrinkFreeGoal} keyboardType="number-pad" placeholder="0 to 7, optional" />
            </View>
          ) : null}
          {stage === 'exploring' ? <T>No date needed. You can decide later, and change this in You.</T> : null}
        </View>
      ) : null}
      {step === 3 ? (
        <View style={{ gap: 10 }}>
          {reasons.map((reason, index) => (
            <Field
              key={index}
              label={`Reason ${index + 1}`}
              value={reason}
              onChangeText={(value) => setReasons((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)))}
              placeholder={reasonPlaceholder(index)}
            />
          ))}
          <Button label="Add another reason" tone="quiet" onPress={() => setReasons((current) => [...current, ''])} />
        </View>
      ) : null}
      {step === 4 ? (
        <View style={{ gap: 10 }}>
          <T variant="muted">{USUAL_WEEK_HELPER}</T>
          <Field label="Typical spend per week (£)" value={spend} onChangeText={setSpend} keyboardType="decimal-pad" />
          <Field
            label="Typical units per week"
            value={units}
            onChangeText={setUnits}
            keyboardType="decimal-pad"
            hint="Your own usual week, used only for your savings counter."
          />
          <UnitsGuide onChange={setUnits} stage={stage} weeklySpend={spend} />
        </View>
      ) : null}
      {step === 5 ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {catalogue.map((interest) => (
              <Choice key={interest.id} label={interest.label} selected={interestIds.includes(interest.id)} onPress={() => toggleInterest(interest.id)} />
            ))}
          </View>
          <Field label="Add another interest" value={custom} onChangeText={setCustom} placeholder="Climbing, choir, five-a-side…" />
          <Button
            label="Add interest"
            tone="quiet"
            pending={addingInterest}
            disabled={addingInterest || !custom.trim()}
            onPress={() => void addInterest()}
          />
        </View>
      ) : null}
      {step === 6 ? (
        <Field label="Town or area" value={town} onChangeText={setTown} placeholder="Bristol, or leave blank" hint="Never a street or postcode. Other people only see this if you turn community on." />
      ) : null}
      {step === 7 ? (
        <ConsentChoices community={community} health={health} ai={ai} onCommunity={setCommunity} onHealth={setHealth} onAi={setAi} />
      ) : null}
      <ErrorNote>{error}</ErrorNote>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button label="Back" tone="quiet" onPress={() => { setError(null); setStep((value) => value - 1); }} /></View> : null}
        <View style={{ flex: 1 }}>
          <Button
            label={step === STEPS - 1 ? 'Enter Charioteer' : 'Continue'}
            pending={pending}
            disabled={step === 1 && adult !== true}
            onPress={() => {
              setError(null);
              if (step === 0 && !name.trim()) return setError('Add your name.');
              if (step === 1 && adult !== true) return setError('Charioteer is for adults aged 18 and over.');
              if (step === 2) {
                const stageError = validateStageStep({
                  stage,
                  soberDay: isoDay(start),
                  today: isoDay(new Date()),
                  plannedQuit: isoDay(plannedQuit),
                  quitUnsure,
                  unitsGoal,
                  drinkFreeGoal,
                });
                if (stageError) return setError(stageError);
              }
              if (step === 3 && !reasons.some((reason) => reason.trim())) return setError('One reason is enough.');
              if (step === 6) {
                const townError = validateTown(town);
                if (townError) return setError(townError);
              }
              if (step === STEPS - 1) return void finish();
              setStep((value) => value + 1);
            }}
          />
        </View>
      </View>
      <T variant="muted" style={{ color: theme.colors.muted }}>You can change these later in You.</T>
    </Screen>
  );
}

const titles = [
  'What should we call you?',
  'This app is for adults.',
  'Where are you right now?',
  'Why does this matter?',
  'Your usual week',
  'What do you like doing?',
  'Roughly where are you?',
  'What may we keep?',
];

const intros = [
  'This is the name other people will see if you join the community.',
  'Confirm you are 18 or over. Charioteer is not for children.',
  'Stopped, trying to stop, cutting down, or just looking. You can change this later.',
  'Thumos will remind you of these in your own words, and only when it helps.',
  'Your own usual week. It is an estimate from what you tell us, not a medical calculation.',
  'Exercise, gym, health and fitness, hiking — or something of your own.',
  'Optional. Town or area only.',
  'Health and drinking data are sensitive. Nothing is turned on unless you agree.',
];

