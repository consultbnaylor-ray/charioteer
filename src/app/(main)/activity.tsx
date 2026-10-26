import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, useWindowDimensions, View } from 'react-native';

import { saveActivitySummary, deleteActivitySummary } from '@/activity/summaries';
import { useRepository, useSnapshot } from '@/data';
import {
  DIARY_HINT,
  FINISH_LINE,
  LIVE_INTRO,
  LOCK_PAUSE_NOTE,
  SETUP_LOCK_LINE,
  WAITING_FIX,
  activityLine,
  activityWord,
  applyFix,
  averagePaceSecPerKm,
  clock,
  distanceLabel,
  extendTrack,
  isActivityKind,
  paceLabel,
  startLabel,
  summaryFrom,
  updatesDue,
  type ActivityFix,
  type ActivityKind,
  type ActivitySummary,
  type UpdateInterval,
} from '@/domain/activitySession';
import { isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { LOCATION_FIX_MESSAGE } from '@/location/whileUsing';
import { readActivityFix } from '@/location/activityFix';
import { GRATITUDE_DIARY_TICK } from '@/domain/sharedPhotos';
import { ActivityGoodToKnow } from '@/ui/ActivityGoodToKnow';
import { FootpathMap } from '@/ui/FootpathMap';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

type LiveState = {
  activity: ActivityKind;
  routeId: string | null;
  routeTitle: string | null;
  /** Accepted fixes for the line on the map. Memory only. Finish does not write this. */
  track: { latitude: number; longitude: number }[];
  intervalMin: UpdateInterval;
  spoken: boolean;
  movingMs: number;
  distanceM: number;
  anchor: ActivityFix | null;
  linesSent: number;
  lastLine: string | null;
  paused: boolean;
  locked: boolean;
  runningSince: number | null;
  triedFix: boolean;
  denied: boolean;
};

type Held = { live: LiveState } | null;

let held: Held = null;

function elapsed(live: LiveState, now = Date.now()): number {
  if (live.paused || live.runningSince == null) return live.movingMs;
  return live.movingMs + Math.max(0, now - live.runningSince);
}

function fold(live: LiveState, now = Date.now()): LiveState {
  return { ...live, movingMs: elapsed(live, now), runningSince: null, paused: true };
}

function silence() {
  void import('expo-speech').then((Speech) => Speech.stop()).catch(() => undefined);
}

function buzz() {
  if (Platform.OS === 'web') return;
  void import('expo-haptics')
    .then((Haptics) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
    .catch(() => undefined);
}

function say(text: string, spoken: boolean) {
  buzz();
  if (!spoken || AppState.currentState !== 'active') return;
  void import('expo-speech').then((Speech) => {
    Speech.stop();
    Speech.speak(text, { language: 'en-GB', rate: 0.95 });
  }).catch(() => undefined);
}

function withLines(live: LiveState, movingMs: number): LiveState {
  const due = updatesDue(movingMs, live.intervalMin, live.linesSent);
  if (due === 0) return live;
  let sent = live.linesSent;
  let last = live.lastLine;
  const pace = averagePaceSecPerKm(live.distanceM, movingMs);
  const paceText = pace == null ? null : paceLabel(pace);
  for (let i = 0; i < due; i += 1) {
    last = activityLine(live.activity, movingMs, paceText === '—' ? null : paceText, sent);
    say(last, live.spoken);
    sent += 1;
  }
  return { ...live, linesSent: sent, lastLine: last };
}

export default function Activity() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const opened = isActivityKind(params.kind) ? params.kind : 'walk';
  const router = useRouter();
  const repo = useRepository();
  const snap = useSnapshot();
  const routes = snap.outdoorRoutes ?? [];
  const [activity, setActivity] = useState<ActivityKind>(held?.live.activity ?? opened);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [intervalMin, setIntervalMin] = useState<UpdateInterval>(held?.live.intervalMin ?? 5);
  const [spoken, setSpoken] = useState(held?.live.spoken ?? true);
  const [following, setFollowing] = useState(true);
  const [phase, setPhase] = useState<'setup' | 'live' | 'finish'>(held ? 'live' : 'setup');
  const windowSize = useWindowDimensions();
  const [live, setLive] = useState<LiveState | null>(held?.live ?? null);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const liveRef = useRef(live);
  const draft = useRef(live);
  const [note, setNote] = useState('');
  const [diary, setDiary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function commit(next: LiveState | null) {
    draft.current = next;
    liveRef.current = next;
    setLive(next);
  }

  useEffect(() => {
    held = phase === 'live' && live ? { live } : null;
  }, [phase, live]);

  useEffect(() => {
    return () => {
      const current = liveRef.current;
      if (!current || current.paused) return;
      const paused = fold(current);
      held = { live: paused };
      silence();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'live' || !live || live.paused) return undefined;
    let gone = false;
    void import('expo-keep-awake').then(async (mod) => {
      if (gone) return;
      try {
        await mod.activateKeepAwakeAsync('charioteer-activity');
      } catch {
        // A browser can refuse the wake lock. The phone keeps the screen on without that prompt.
      }
    }).catch(() => undefined);
    return () => {
      gone = true;
      void import('expo-keep-awake').then((mod) => mod.deactivateKeepAwake('charioteer-activity')).catch(() => undefined);
    };
  }, [phase, live?.paused]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'background') return;
      const current = draft.current;
      if (!current) return;
      if (current.paused) {
        commit({ ...current, locked: true });
        return;
      }
      silence();
      commit({ ...fold(current), locked: true });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (phase !== 'live' || !live || live.paused) return undefined;
    const id = setInterval(() => {
      const current = draft.current;
      if (!current || current.paused) return;
      const movingMs = elapsed(current);
      const next = withLines({ ...current, movingMs, runningSince: Date.now() }, movingMs);
      commit(next);
    }, 1000);
    return () => clearInterval(id);
  }, [phase, live?.paused]);

  useEffect(() => {
    if (phase !== 'live' || !live || live.paused || live.denied) return undefined;
    let stop = false;
    async function poll() {
      const result = await readActivityFix();
      if (stop) return;
      const current = draft.current;
      if (!current || current.paused) return;
      const next = !result.ok
        ? { ...current, triedFix: true, denied: result.reason === 'denied' }
        : (() => {
          const step = applyFix(current.activity, current.anchor, result.fix);
          return {
            ...current,
            triedFix: true,
            denied: false,
            anchor: step.previous,
            distanceM: current.distanceM + step.addedM,
            track: extendTrack(current.track, current.anchor, step),
          };
        })();
      commit(next);
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [phase, live?.paused, live?.denied]);

  function start() {
    const route = routes.find((item) => item.id === routeId);
    const next: LiveState = {
      activity,
      routeId: route?.id ?? null,
      routeTitle: route?.title ?? null,
      track: [],
      intervalMin,
      spoken,
      movingMs: 0,
      distanceM: 0,
      anchor: null,
      linesSent: 0,
      lastLine: null,
      paused: false,
      locked: false,
      runningSince: Date.now(),
      triedFix: false,
      denied: false,
    };
    held = { live: next };
    commit(next);
    setFollowing(true);
    setPhase('live');
    setError(null);
  }

  function pauseOrResume() {
    const current = draft.current;
    if (!current) return;
    if (!current.paused) {
      silence();
      commit({ ...fold(current), locked: false });
      return;
    }
    commit({ ...current, paused: false, locked: false, runningSince: Date.now() });
  }

  async function finish() {
    const current = liveRef.current;
    if (!current) return;
    silence();
    const folded = fold(current);
    const saved = summaryFrom({
      id: `${Date.now()}`,
      activity: folded.activity,
      date: isoDay(new Date()),
      distanceM: folded.distanceM,
      movingMs: folded.movingMs,
    });
    try {
      await saveActivitySummary(saved);
    } catch {
      setError('Could not keep that summary on this phone.');
    }
    if (spoken) say(FINISH_LINE, true);
    held = null;
    commit(null);
    setSummary(saved);
    setPhase('finish');
  }

  async function done() {
    setError(null);
    const words = note.trim();
    if (diary && words) {
      setPending(true);
      try {
        await repo.addGratitudeEntry({
          body: words,
          category: null,
          isFavourite: false,
          entryDate: isoDay(new Date()),
        });
      } catch (err) {
        setPending(false);
        setError(shownError(err, 'Could not save that line.'));
        return;
      }
      setPending(false);
    }
    router.back();
  }

  async function discard() {
    if (summary) {
      try {
        await deleteActivitySummary(summary.id);
      } catch {
        setError('Could not remove that summary.');
        return;
      }
    }
    held = null;
    router.back();
  }

  const moving = live ? elapsed(live) : 0;
  const pace = live ? averagePaceSecPerKm(live.distanceM, moving) : summary?.averagePaceSecPerKm ?? null;

  if (phase === 'finish' && summary) {
    return (
      <Screen key="finish" eyebrow={activityWord(summary.activity)} title="Finished" intro="Kept on this phone. Don't keep this throws it away.">
        <Card>
          <T variant="label">Distance</T>
          <T variant="title">{distanceLabel(summary.distanceM)}</T>
          <T variant="label">Time</T>
          <T variant="title">{clock(summary.movingMs)}</T>
          <T variant="label">Average pace</T>
          <T variant="title">{paceLabel(summary.averagePaceSecPerKm)}</T>
        </Card>
        <Card>
          <T variant="label">Thumos</T>
          <T>{FINISH_LINE}</T>
          <Field label="A note" value={note} onChangeText={setNote} placeholder="A few words, if you want" multiline />
          <Choice label={GRATITUDE_DIARY_TICK} selected={diary} onPress={() => setDiary((value) => !value)} />
          <T variant="muted">{DIARY_HINT}</T>
        </Card>
        <Card>
          <Button label="Done" onPress={() => { void done(); }} pending={pending} pendingLabel="Saving" />
          <Button label="Don't keep this" tone="quiet" onPress={() => { void discard(); }} />
          <T variant="muted">Done keeps the distance, the time, and the pace on this phone.</T>
        </Card>
        <ErrorNote>{error}</ErrorNote>
        <ActivityGoodToKnow kind="live" />
      </Screen>
    );
  }

  if (phase === 'live' && live) {
    const quiet = live.intervalMin === 0
      ? 'Updates are off. The clock still runs.'
      : 'The first line comes at the interval you chose.';
    const planned = live.routeId ? routes.filter((item) => item.id === live.routeId) : [];
    const here = live.anchor
      ? { latitude: live.anchor.latitude, longitude: live.anchor.longitude }
      : null;
    const mapHeight = windowSize.width < 360 ? 200 : 230;
    return (
      <Screen
        key="live"
        eyebrow={activityWord(live.activity)}
        title="Out"
        intro={LIVE_INTRO}
        footer={(
          <View style={{ gap: 8 }}>
            {live.locked ? <T>{LOCK_PAUSE_NOTE}</T> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label={live.paused ? 'Resume' : 'Pause'} onPress={pauseOrResume} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Finish" tone="quiet" onPress={() => { void finish(); }} />
              </View>
            </View>
          </View>
        )}
      >
        <FootpathMap
          routes={planned}
          sketch={[]}
          here={here}
          track={live.track}
          follow={following}
          locationFocus={following && here ? 1 : 0}
          height={mapHeight}
          onUserMove={() => setFollowing(false)}
          onRecentre={() => setFollowing(true)}
        />
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="label">Time</T>
              <T variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{clock(moving)}</T>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="label">Distance</T>
              <T variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{distanceLabel(live.distanceM)}</T>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="label">Pace</T>
              <T variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{paceLabel(pace)}</T>
            </View>
          </View>
          {live.triedFix && live.anchor == null && !live.denied ? <T variant="muted">{WAITING_FIX}</T> : null}
          {live.denied ? <T variant="muted">{LOCATION_FIX_MESSAGE}</T> : null}
          <T variant="label">Thumos</T>
          <T>{live.lastLine ?? quiet}</T>
          {live.routeTitle ? <T variant="muted">Reminder: {live.routeTitle}. Turns are not spoken.</T> : null}
        </Card>
        <ActivityGoodToKnow kind="live" />
      </Screen>
    );
  }

  return (
    <Screen key="setup" eyebrow="Tools" title={startLabel(activity)} intro="You choose the pace. The phone keeps the time.">
      <Card>
        <T variant="label">Activity</T>
        {(['walk', 'run', 'cycle'] as const).map((kind) => (
          <Choice key={kind} label={activityWord(kind)} selected={activity === kind} onPress={() => setActivity(kind)} />
        ))}
      </Card>
      <Card>
        <T variant="label">Route</T>
        <T variant="muted">Optional. A saved route is a reminder, not a guide that speaks turns.</T>
        <Choice label="No route" selected={routeId == null} onPress={() => setRouteId(null)} />
        {routes.map((route) => (
          <Choice key={route.id} label={route.title} selected={routeId === route.id} onPress={() => setRouteId(route.id)} />
        ))}
      </Card>
      <Card>
        <T variant="label">Updates from Thumos</T>
        {([
          [3, '3 min'],
          [5, '5 min'],
          [10, '10 min'],
          [0, 'Off'],
        ] as const).map(([value, label]) => (
          <Choice key={label} label={label} selected={intervalMin === value} onPress={() => setIntervalMin(value)} />
        ))}
        <Choice label="Spoken and on screen" selected={spoken} onPress={() => setSpoken(true)} />
        <Choice label="On screen only" selected={!spoken} onPress={() => setSpoken(false)} />
        <T variant="muted">The lines are written on this phone. Pace and time are filled in here. Nothing is sent.</T>
      </Card>
      <Card>
        <Button label="Start" onPress={start} />
        <Button label="Not now" tone="quiet" onPress={() => router.back()} />
        <T variant="muted">{SETUP_LOCK_LINE}</T>
      </Card>
      <ActivityGoodToKnow kind="setup" />
    </Screen>
  );
}
