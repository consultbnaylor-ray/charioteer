import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Switch, View } from 'react-native';

import { claimLive, releaseLive } from '@/activity/oneSession';
import { speakIfGated, stopSpeaking } from '@/activity/speakLine';
import { readActivityUpdates } from '@/activity/updateDefaults';
import {
  AUDIO_DUCK_LINE,
  GYM_BEFORE_START,
  HEART_FOREGROUND_LINE,
  NO_HEART_SOURCE,
  OTHER_SESSION_LINE,
  SPEECH_GATE_NOTE,
  WATCH_HEART_HINT,
  clock,
  gymLine,
  shownEnergy,
  shownHeart,
  updatesDue,
  type GymKind,
} from '@/domain/activitySession';
import { LIVE_SESSION_ENABLED } from '@/domain/liveSessionFlag';
import { OUTSIDE_CRISIS_LINE, OUTSIDE_SAFETY_LINE } from '@/domain/outdoorRoute';
import { watchLiveReading, type LiveReading } from '@/health/liveReading';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Screen, T } from '@/ui/ui';

const QUIET = 'Updates are off. The clock still runs.';

function buzz() {
  if (Platform.OS === 'web') return;
  void import('expo-haptics')
    .then((Haptics) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
    .catch(() => undefined);
}

export default function GymSession() {
  if (!LIVE_SESSION_ENABLED) return <Redirect href="/workouts" />;
  return <GymSessionScreen />;
}

function GymSessionScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const [kind, setKind] = useState<GymKind>('strength');
  const [updatesOn, setUpdatesOn] = useState(false);
  const [intervalMin, setIntervalMin] = useState<3 | 5 | 10>(5);
  const [spoken, setSpoken] = useState(false);
  const [phase, setPhase] = useState<'setup' | 'live'>('setup');
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [movingMs, setMovingMs] = useState(0);
  const [linesSent, setLinesSent] = useState(0);
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [heart, setHeart] = useState<LiveReading>({ bpm: null, bpmAtMs: null, activeKcal: null });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => {
    stopSpeaking();
    releaseLive('gym');
  }, []);

  useEffect(() => {
    if (phase === 'live') claimLive('gym');
  }, [phase]);
  const sessionSpoken = useRef(false);
  const sessionInterval = useRef<0 | 3 | 5 | 10>(0);
  const sessionKind = useRef<GymKind>('strength');
  const sentRef = useRef(0);
  const live = phase === 'live';

  useEffect(() => {
    let gone = false;
    void readActivityUpdates().then((choice) => {
      if (gone) return;
      setUpdatesOn(choice.enabled);
      setIntervalMin(choice.intervalMin);
      setSpoken(choice.spoken);
    }).catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    if (!live || runningSince == null) return undefined;
    const id = setInterval(() => {
      const elapsed = Date.now() - runningSince;
      setMovingMs(elapsed);
      const due = updatesDue(elapsed, sessionInterval.current, sentRef.current);
      if (due === 0) return;
      let sent = sentRef.current;
      let line = '';
      for (let i = 0; i < due; i += 1) {
        line = gymLine(sessionKind.current, elapsed, sent);
        buzz();
        speakIfGated(line, sessionSpoken.current);
        sent += 1;
      }
      sentRef.current = sent;
      setLinesSent(sent);
      setLastLine(line);
    }, 1000);
    return () => clearInterval(id);
  }, [live, runningSince]);

  useEffect(() => {
    if (!live || runningSince == null) return undefined;
    let stop = () => undefined as void;
    let gone = false;
    void watchLiveReading(runningSince, true, (reading) => {
      if (!gone) setHeart(reading);
    }).then((cancel) => {
      if (gone) cancel();
      else stop = cancel;
    }).catch(() => undefined);
    return () => {
      gone = true;
      stop();
    };
  }, [live, runningSince]);

  function start() {
    const claimed = claimLive('gym');
    if (!claimed.ok) {
      setError(OTHER_SESSION_LINE);
      return;
    }
    sessionKind.current = kind;
    sessionInterval.current = updatesOn ? intervalMin : 0;
    sessionSpoken.current = updatesOn ? spoken : false;
    sentRef.current = 0;
    setLinesSent(0);
    setLastLine(null);
    setMovingMs(0);
    setError(null);
    setRunningSince(Date.now());
    setPhase('live');
  }

  function stop() {
    stopSpeaking();
    releaseLive('gym');
    setPhase('setup');
    setRunningSince(null);
    router.back();
  }

  const heartNow = shownHeart(heart.bpm, heart.bpmAtMs, Date.now());
  const energy = shownEnergy(heart.activeKcal);

  if (live) {
    return (
      <Screen
        eyebrow="Workouts"
        title={kind === 'strength' ? 'Strength' : 'Cardio'}
        intro="The clock runs until you tap Stop."
        footer={(
          <Button label="Stop" onPress={stop} />
        )}
      >
        <Card>
          <T variant="label">Time</T>
          <T variant="title">{clock(movingMs)}</T>
          <T variant="label">Heart rate</T>
          <T>{heartNow.label}{heartNow.label !== NO_HEART_SOURCE ? ' · Apple Watch' : ''}{heartNow.age ? ` · ${heartNow.age}` : ''}</T>
          {heartNow.label === NO_HEART_SOURCE ? <T variant="muted">{WATCH_HEART_HINT}</T> : null}
          {heartNow.warning ? <T variant="muted">{heartNow.warning}</T> : null}
          <T variant="muted">{HEART_FOREGROUND_LINE}</T>
          <T variant="label">Active energy</T>
          <T>{energy}</T>
          <T variant="label">Thumos</T>
          <T>{lastLine ?? (linesSent === 0 && sessionInterval.current === 0 ? QUIET : 'The first line comes at the interval you chose.')}</T>
          {sessionSpoken.current ? <T variant="muted">{AUDIO_DUCK_LINE}</T> : null}
          {sessionSpoken.current ? <T variant="muted">{SPEECH_GATE_NOTE}</T> : null}
        </Card>
        <Card>
          <T variant="muted">{OUTSIDE_SAFETY_LINE}</T>
          <T variant="muted">{OUTSIDE_CRISIS_LINE}</T>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen eyebrow="Workouts" title="Start live session" intro="Strength or cardio. No map, and no route.">
      <Card>
        <T variant="label">Session</T>
        <Choice label="Strength" selected={kind === 'strength'} onPress={() => setKind('strength')} />
        <Choice label="Cardio" selected={kind === 'cardio'} onPress={() => setKind('cardio')} />
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <T style={{ flex: 1 }}>Thumos updates</T>
          <Switch
            accessibilityLabel="Thumos updates"
            value={updatesOn}
            onValueChange={setUpdatesOn}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
        {updatesOn ? (
          <>
            {([
              [3, '3 minutes'],
              [5, '5 minutes'],
              [10, '10 minutes'],
            ] as const).map(([value, label]) => (
              <Choice key={label} label={label} selected={intervalMin === value} onPress={() => setIntervalMin(value)} />
            ))}
            <Choice label="Spoken and on screen" selected={spoken} onPress={() => setSpoken(true)} />
            <Choice label="On screen only" selected={!spoken} onPress={() => setSpoken(false)} />
          </>
        ) : <T variant="muted">Off for this session. The default on You stays as it is.</T>}
        {updatesOn && spoken ? <T variant="muted">{AUDIO_DUCK_LINE}</T> : null}
        {updatesOn && spoken ? <T variant="muted">{SPEECH_GATE_NOTE}</T> : null}
      </Card>
      <Card>
        <T>{GYM_BEFORE_START}</T>
        <Button label="Start" onPress={start} />
        <Button label="Not now" tone="quiet" onPress={() => router.back()} />
      </Card>
      <ErrorNote>{error}</ErrorNote>
    </Screen>
  );
}
