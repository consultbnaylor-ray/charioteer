import { useRef, useState } from 'react';
import { Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { formatUkLong, isoDay, parseIsoDay, startOfLocalDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { planCustomInterest, validateTown } from '@/domain/privacy';
import { reasonPlaceholder } from '@/domain/reasons';
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
  const [start, setStart] = useState(() => startOfLocalDay(new Date()));
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
      await repo.completeOnboarding({
        displayName: name,
        sobrietyStartedAt: toInstant(start),
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

  const catalogue = snap.interests.filter((interest) => !interest.custom || interestIds.includes(interest.id));

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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Choice label="Today" selected={isoDay(start) === isoDay(new Date())} onPress={() => setStart(startOfLocalDay(new Date()))} />
            <Choice label="Yesterday" selected={isoDay(start) === isoDay(daysAgo(1))} onPress={() => setStart(daysAgo(1))} />
            <Choice label="A week ago" selected={isoDay(start) === isoDay(daysAgo(7))} onPress={() => setStart(daysAgo(7))} />
          </View>
          <DateField label="Or a date" value={start} onChange={setStart} maximumDate={new Date()} hint="Use the day you stopped, or today if you are starting now." />
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
          <Field label="Typical spend per week (£)" value={spend} onChangeText={setSpend} keyboardType="decimal-pad" />
          <Field
            label="Typical units per week"
            value={units}
            onChangeText={setUnits}
            keyboardType="decimal-pad"
            hint="Your own usual week, used only for your savings counter."
          />
          <UnitsGuide onChange={setUnits} />
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
        <View style={{ gap: 16 }}>
          <Consent
            title="Community"
            body="Other adults can see your name, town or area, and interests. They cannot see your reasons, check-ins, money, units, or health."
            value={community}
            onChange={setCommunity}
          />
          <Consent
            title="Health data"
            body="Steps, sleep, heart rate, heart-rate variability, workouts, and weight are special category data under UK GDPR. Stored so you and Thumos can see trends. Quantica Labs Ltd is the controller. You can export or delete them with your account."
            value={health}
            onChange={setHealth}
          />
          <Consent
            title="Thumos, the coach"
            body="What you type, plus days sober, check-ins, reasons, and health summaries, is sent to xAI to write a reply. Thumos is not a doctor."
            value={ai}
            onChange={setAi}
          />
          <T variant="muted">This consent screen is plain language, not a solicitor’s privacy notice. Have it reviewed before a public launch. Version {formatUkLong(parseIsoDay('2026-10-10'))}.</T>
        </View>
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
              if (step === 2 && isoDay(start) > isoDay(new Date())) return setError('Choose today or an earlier day.');
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
  'When did you stop?',
  'Why does this matter?',
  'Your usual week',
  'What do you like doing?',
  'Roughly where are you?',
  'What may we keep?',
];

const intros = [
  'This is the name other people will see if you join the community.',
  'Confirm you are 18 or over. Charioteer is not for children.',
  'If you drank today, you can still begin now. A later lapse does not wipe the record of the days you kept.',
  'Thumos will remind you of these in your own words, and only when it helps.',
  'Used for money saved and units avoided. It is an estimate from what you tell us, not a medical calculation.',
  'Swimming, hiking, dancing, sober raving, cinema and meals, nights in — or something of your own.',
  'Optional. Town or area only.',
  'Health and drinking data are sensitive. Nothing is turned on unless you agree.',
];

function Consent({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (value: boolean) => void }) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T variant="title" style={{ fontSize: 20, flex: 1 }}>{title}</T>
        <Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ true: theme.colors.ink, false: theme.colors.line }} thumbColor={theme.colors.surface} />
      </View>
      <T variant="muted">{body}</T>
    </View>
  );
}
