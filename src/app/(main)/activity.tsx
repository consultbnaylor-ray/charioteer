import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Switch, useWindowDimensions, View } from 'react-native';

import { claimLive, releaseLive } from '@/activity/oneSession';
import { speakIfGated, stopSpeaking } from '@/activity/speakLine';
import { readActivityUpdates, type ActivityUpdateChoice } from '@/activity/updateDefaults';
import { saveActivitySummary, deleteActivitySummary } from '@/activity/summaries';
import { dropFinishOnLeave, noteFinishSaved, readFinishHold, setFinishHold } from '@/activity/finishHold';
import {
  DROP_ENDS,
  FEWER_POINTS,
  KEEP_WHOLE_LINE,
  LINE_DROPPED_MANY,
  LINE_DROPPED_ONE,
  LINE_TOO_SHORT,
  ON_THIS_PHONE,
  PHONE_LINE_DELETE,
  SAVE_ON_PHONE,
  SIGN_OUT_LINES,
  copyWalkedPoints,
  deleteWalkedLine,
  loadWalkedLines,
  prepareWalkedLine,
  saveWalkedLine,
  suggestWalkedName,
  type WalkedLine,
  type WalkedPoint,
} from '@/activity/walkedLine';
import { useRepository, useSnapshot } from '@/data';
import {
  ACTIVITY_LOCATION_LINE,
  AUDIO_DUCK_LINE,
  DIARY_HINT,
  FINISH_LINE,
  HEART_FOREGROUND_LINE,
  LIVE_INTRO,
  NO_HEART_SOURCE,
  OTHER_SESSION_LINE,
  PAUSED_LINE,
  SPEECH_GATE_NOTE,
  TIME_LIMIT_LINE,
  TRACKING_ACTIVE_LINE,
  WAITING_FIX,
  WATCH_HEART_HINT,
  activityLine,
  activityWord,
  applyFix,
  averagePaceSecPerKm,
  beforeStartLine,
  clock,
  currentSplitLabel,
  distanceLabel,
  extendTrack,
  isActivityKind,
  paceLabel,
  shownHeart,
  splitRow,
  splitsForDistance,
  startLabel,
  summaryFrom,
  updatesDue,
  type ActivityFix,
  type ActivityKind,
  type ActivitySummary,
  type SplitMark,
  type UpdateInterval,
} from '@/domain/activitySession';
import { ROUTE_NAME_FIELD, ROUTE_NEEDS_NAME, SAVED_LINE_ON_MAP, copyGuide, guideLine, guideRoute } from '@/domain/savedRoute';
import { isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { watchLiveReading, type LiveReading } from '@/health/liveReading';
import { LOCATION_FIX_MESSAGE } from '@/location/whileUsing';
import {
  ensureActivityWatch,
  pauseActivityWatch,
  setOutingHooks,
  stopActivityWatch,
  type ActivityFixResult,
} from '@/location/activityFix';
import { GRATITUDE_DIARY_TICK } from '@/domain/sharedPhotos';
import { ActivityGoodToKnow } from '@/ui/ActivityGoodToKnow';
import { FootpathMap } from '@/ui/FootpathMap';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, Screen, T } from '@/ui/ui';

type LiveState = {
  activity: ActivityKind;
  routeId: string | null;
  routeTitle: string | null;
  /** Saved points copied at Start. A later rename or delete does not change them. Not sent, and not written into the summary. */
  guide: { latitude: number; longitude: number }[];
  /** Accepted fixes for the line on the map. Memory only. Stop does not write this. */
  track: { latitude: number; longitude: number }[];
  splits: SplitMark[];
  intervalMin: UpdateInterval;
  spoken: boolean;
  movingMs: number;
  distanceM: number;
  anchor: ActivityFix | null;
  linesSent: number;
  lastLine: string | null;
  paused: boolean;
  runningSince: number | null;
  limitFrom: number;
  triedFix: boolean;
  denied: boolean;
};

type Held = { live: LiveState } | null;

let held: Held = null;
const draft: { current: LiveState | null } = { current: null };
const liveRef: { current: LiveState | null } = { current: null };
const ending = { current: false };
let screenMounted = false;
let pushLiveState: ((next: LiveState | null) => void) | null = null;
let stopFromScreen: (() => void) | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const presenceListeners = new Set<() => void>();

export function runningOutingKind(): ActivityKind | null {
  return held?.live.activity ?? null;
}

export function subscribeOutingPresence(listener: () => void): () => void {
  presenceListeners.add(listener);
  return () => {
    presenceListeners.delete(listener);
  };
}

function notifyOutingPresence(): void {
  for (const listener of presenceListeners) listener();
}

/** Stops a live outing from Outside is Good or home. The outing screen uses its own Stop. */
export function stopRunningOuting(): void {
  if (stopFromScreen) {
    stopFromScreen();
    return;
  }
  const current = liveRef.current;
  if (!current || ending.current) return;
  ending.current = true;
  stopSpeaking();
  stopActivityWatch();
  releaseLive('outing');
  const keptLine = copyWalkedPoints(current.track);
  const folded = fold(clearPath(current));
  const saved = summaryFrom({
    id: `${Date.now()}`,
    activity: folded.activity,
    date: isoDay(new Date()),
    distanceM: folded.distanceM,
    movingMs: folded.movingMs,
  });
  void saveActivitySummary(saved).catch(() => undefined);
  say(FINISH_LINE, current.spoken);
  stopOutingClock();
  setFinishHold({ summary: saved, limit: false, splits: current.splits.slice(), line: keptLine, savedId: null });
  held = null;
  publish(null);
  notifyOutingPresence();
}

function publish(next: LiveState | null) {
  draft.current = next;
  liveRef.current = next;
  if (next) held = { live: next };
  if (screenMounted) pushLiveState?.(next);
}

function stopOutingClock() {
  if (clockTimer == null) return;
  clearInterval(clockTimer);
  clockTimer = null;
}

/** Keeps time and spoken lines going after the outing screen is left. */
function ensureOutingClock() {
  if (clockTimer != null) return;
  clockTimer = setInterval(() => {
    const current = draft.current;
    if (!current || current.paused || ending.current) return;
    const movingMs = elapsed(current);
    publish(withLines({ ...current, movingMs, runningSince: Date.now() }, movingMs));
  }, 1000);
}

function elapsed(live: LiveState, now = Date.now()): number {
  if (live.paused || live.runningSince == null) return live.movingMs;
  return live.movingMs + Math.max(0, now - live.runningSince);
}

function fold(live: LiveState, now = Date.now()): LiveState {
  return { ...live, movingMs: elapsed(live, now), runningSince: null, paused: true, track: [] };
}

function buzz() {
  if (Platform.OS === 'web') return;
  void import('expo-haptics')
    .then((Haptics) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
    .catch(() => undefined);
}

function say(text: string, spoken: boolean) {
  buzz();
  speakIfGated(text, spoken);
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

function clearPath(live: LiveState): LiveState {
  live.track.splice(0, live.track.length);
  return { ...live, track: [] };
}

function oneParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : null;
}

export default function Activity() {
  const params = useLocalSearchParams<{ kind?: string; route?: string | string[] }>();
  const opened = isActivityKind(params.kind) ? params.kind : 'walk';
  const askedRoute = oneParam(params.route);
  const router = useRouter();
  const theme = useAppTheme();
  const repo = useRepository();
  const snap = useSnapshot();
  const routes = snap.outdoorRoutes ?? [];
  const [activity, setActivity] = useState<ActivityKind>(held?.live.activity ?? opened);
  const [routeId, setRouteId] = useState<string | null>(held?.live.routeId ?? null);
  const appliedRoute = useRef(false);
  useEffect(() => {
    if (appliedRoute.current || held || !askedRoute) return;
    if (!routes.some((item) => item.id === askedRoute)) return;
    appliedRoute.current = true;
    setRouteId(askedRoute);
  }, [askedRoute, routes]);
  const [updatesOn, setUpdatesOn] = useState(false);
  const [intervalMin, setIntervalMin] = useState<3 | 5 | 10>(5);
  const [spoken, setSpoken] = useState(false);
  const [following, setFollowing] = useState(true);
  const [phase, setPhase] = useState<'setup' | 'live' | 'finish'>(readFinishHold() ? 'finish' : held ? 'live' : 'setup');
  const windowSize = useWindowDimensions();
  const mapHeight = windowSize.width < 360 ? 200 : 230;
  const [live, setLive] = useState<LiveState | null>(held?.live ?? null);
  const [summary, setSummary] = useState<ActivitySummary | null>(readFinishHold()?.summary ?? null);
  const [endedByLimit, setEndedByLimit] = useState(readFinishHold()?.limit ?? false);
  const [heart, setHeart] = useState<LiveReading>({ bpm: null, bpmAtMs: null, activeKcal: null });
  const [note, setNote] = useState('');
  const [diary, setDiary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savedSplits, setSavedSplits] = useState<SplitMark[]>(readFinishHold()?.splits ?? []);
  const [finishLine, setFinishLine] = useState<WalkedPoint[]>(readFinishHold()?.line ?? []);
  const [savedLineId, setSavedLineId] = useState<string | null>(readFinishHold()?.savedId ?? null);
  const [trimEndsOn, setTrimEndsOn] = useState(true);
  const [fewerOn, setFewerOn] = useState(false);
  const [lineName, setLineName] = useState(() => {
    const opening = readFinishHold();
    return opening ? suggestWalkedName(opening.summary.activity, opening.summary.date) : '';
  });
  const [roomNote, setRoomNote] = useState<string | null>(null);
  const [phoneLines, setPhoneLines] = useState<WalkedLine[]>([]);
  const [phoneLineId, setPhoneLineId] = useState<string | null>(null);

  function commit(next: LiveState | null) {
    publish(next);
  }

  function applyReading(result: ActivityFixResult) {
    const current = draft.current;
    if (!current || current.paused || ending.current) return;
    if (!result.ok) {
      commit({ ...current, triedFix: true, denied: result.reason === 'denied' });
      return;
    }
    const step = applyFix(current.activity, current.anchor, result.fix);
    const distanceM = current.distanceM + step.addedM;
    const movingMs = elapsed(current);
    const splits = splitsForDistance(distanceM, movingMs, current.splits);
    commit(withLines({
      ...current,
      triedFix: true,
      denied: false,
      anchor: step.previous,
      distanceM,
      splits,
      track: extendTrack(current.track, current.anchor, step),
    }, movingMs));
  }

  async function endOuting(reason: 'stop' | 'limit') {
    if (ending.current) return;
    const current = liveRef.current;
    if (!current) return;
    ending.current = true;
    stopSpeaking();
    stopActivityWatch();
    releaseLive('outing');
    const keptLine = copyWalkedPoints(current.track);
    const folded = fold(clearPath(current));
    const splits = current.splits.slice();
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
      if (screenMounted) setError('Could not keep that summary on this phone.');
    }
    if (reason === 'stop') say(FINISH_LINE, current.spoken);
    stopOutingClock();
    held = null;
    notifyOutingPresence();
    setFinishHold({ summary: saved, limit: reason === 'limit', splits, line: keptLine, savedId: null });
    if (!screenMounted) {
      publish(null);
      return;
    }
    publish(null);
    setSavedSplits(splits);
    setFinishLine(keptLine);
    setSavedLineId(null);
    setTrimEndsOn(true);
    setFewerOn(false);
    setLineName(suggestWalkedName(saved.activity, saved.date));
    setSummary(saved);
    setEndedByLimit(reason === 'limit');
    setPhase('finish');
  }

  useEffect(() => {
    screenMounted = true;
    pushLiveState = setLive;
    stopFromScreen = () => { void endOuting('stop'); };
    setOutingHooks({
      onFix: (result) => applyReading(result),
      onLimit: () => { void endOuting('limit'); },
    });
    if (held?.live) {
      claimLive('outing');
      ensureOutingClock();
    }
    return () => {
      screenMounted = false;
      pushLiveState = null;
      stopFromScreen = null;
      dropFinishOnLeave();
    };
  }, []);

  useEffect(() => {
    if (phase === 'live' && live) held = { live };
    else if (phase !== 'live') held = null;
  }, [phase, live]);

  useEffect(() => {
    if (phase !== 'setup' || held) return undefined;
    let gone = false;
    void loadWalkedLines().then((rows) => {
      if (!gone) setPhoneLines(rows);
    }).catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [phase]);

  useEffect(() => {
    if (held) return undefined;
    let gone = false;
    void readActivityUpdates().then((choice: ActivityUpdateChoice) => {
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
    if (phase !== 'live' || !live || live.paused || live.denied) return undefined;
    let stop = false;
    ensureOutingClock();
    void ensureActivityWatch(live.limitFrom).then((result) => {
      if (stop || ending.current) return;
      if (!result.ok && result.reason === 'denied') applyReading(result);
    });
    return () => {
      stop = true;
    };
  }, [phase, live?.paused, live?.denied, live?.limitFrom]);

  useEffect(() => {
    if (phase !== 'live') return undefined;
    let stop = () => undefined as void;
    let gone = false;
    void watchLiveReading(live?.limitFrom ?? Date.now(), false, (reading) => {
      if (!gone) setHeart(reading);
    }).then((cancel) => {
      if (gone) cancel();
      else stop = cancel;
    }).catch(() => undefined);
    return () => {
      gone = true;
      stop();
    };
  }, [phase, live?.limitFrom]);

  function start() {
    const claimed = claimLive('outing');
    if (!claimed.ok) {
      setError(OTHER_SESSION_LINE);
      return;
    }
    const phone = phoneLines.find((item) => item.id === phoneLineId) ?? null;
    const route = phone ? null : routes.find((item) => item.id === routeId) ?? null;
    const copied = phone ? copyGuide({ title: phone.name, points: phone.points }) : copyGuide(route);
    const now = Date.now();
    const next: LiveState = {
      activity,
      routeId: route?.id ?? null,
      routeTitle: copied?.title ?? null,
      guide: copied?.points ?? [],
      track: [],
      splits: [],
      intervalMin: updatesOn ? intervalMin : 0,
      spoken: updatesOn ? spoken : false,
      movingMs: 0,
      distanceM: 0,
      anchor: null,
      linesSent: 0,
      lastLine: null,
      paused: false,
      runningSince: now,
      limitFrom: now,
      triedFix: false,
      denied: false,
    };
    ending.current = false;
    held = { live: next };
    commit(next);
    notifyOutingPresence();
    ensureOutingClock();
    setFollowing(true);
    setPhase('live');
    setError(null);
  }

  function pauseOrResume() {
    const current = draft.current;
    if (!current || ending.current) return;
    if (!current.paused) {
      stopSpeaking();
      pauseActivityWatch();
      commit({ ...current, movingMs: elapsed(current), runningSince: null, paused: true });
      return;
    }
    commit({ ...current, paused: false, runningSince: Date.now() });
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
    dropFinishOnLeave();
    setFinishLine([]);
    router.back();
  }

  async function keepLine() {
    if (!summary) return;
    const name = lineName.trim();
    if (!name) {
      setError(ROUTE_NEEDS_NAME);
      return;
    }
    const prepared = prepareWalkedLine(finishLine, { trim: trimEndsOn, fewer: fewerOn });
    if (prepared.points.length < 2) return;
    const id = savedLineId ?? `${Date.now()}`;
    let dropped = 0;
    try {
      const kept = await saveWalkedLine({
        id,
        name,
        activity: summary.activity,
        date: summary.date,
        points: prepared.points,
      });
      dropped = kept.dropped;
    } catch {
      setError('Could not keep that line on this phone.');
      return;
    }
    setError(null);
    setSavedLineId(id);
    noteFinishSaved(summary.id, id);
    setRoomNote(dropped > 1 ? LINE_DROPPED_MANY : dropped === 1 ? LINE_DROPPED_ONE : null);
  }

  async function removePhoneLine(id: string) {
    try {
      await deleteWalkedLine(id);
    } catch {
      setError('Could not remove that line.');
      return;
    }
    if (phoneLineId === id) setPhoneLineId(null);
    setPhoneLines(await loadWalkedLines());
  }

  async function discard() {
    const dropId = readFinishHold()?.savedId ?? savedLineId;
    if (dropId) {
      try {
        await deleteWalkedLine(dropId);
      } catch {
        setError('Could not remove that line.');
        return;
      }
    }
    if (summary) {
      try {
        await deleteActivitySummary(summary.id);
      } catch {
        setError('Could not remove that summary.');
        return;
      }
    }
    dropFinishOnLeave();
    setFinishLine([]);
    ending.current = true;
    stopSpeaking();
    stopActivityWatch();
    stopOutingClock();
    releaseLive('outing');
    if (liveRef.current) clearPath(liveRef.current);
    held = null;
    publish(null);
    notifyOutingPresence();
    router.back();
  }

  const moving = live ? elapsed(live) : 0;
  const pace = live ? averagePaceSecPerKm(live.distanceM, moving) : summary?.averagePaceSecPerKm ?? null;
  const heartNow = shownHeart(heart.bpm, heart.bpmAtMs, Date.now());

  if (phase === 'finish' && summary) {
    const prepared = prepareWalkedLine(finishLine, { trim: trimEndsOn, fewer: fewerOn });
    return (
      <Screen key="finish" eyebrow={activityWord(summary.activity)} title="Finished" intro={endedByLimit ? TIME_LIMIT_LINE : "Kept on this phone. Don't keep this throws it away."}>
        <FootpathMap
          routes={[]}
          sketch={[]}
          here={null}
          track={prepared.points}
          height={mapHeight}
        />
        <Card>
          <T variant="label">Distance</T>
          <T variant="title">{distanceLabel(summary.distanceM)}</T>
          <T variant="label">Time</T>
          <T variant="title">{clock(summary.movingMs)}</T>
          <T variant="label">Average pace</T>
          <T variant="title">{paceLabel(summary.averagePaceSecPerKm)}</T>
          {savedSplits.map((mark, index) => (
            <T key={mark.kilometre} variant="muted">{splitRow(mark, index === 0 ? 0 : savedSplits[index - 1].movingMs)}</T>
          ))}
        </Card>
        <Card>
          <Field label={ROUTE_NAME_FIELD} value={lineName} onChangeText={setLineName} maxLength={80} />
          <Choice label={DROP_ENDS} selected={trimEndsOn} onPress={() => setTrimEndsOn(true)} />
          <Choice label={KEEP_WHOLE_LINE} selected={!trimEndsOn} onPress={() => setTrimEndsOn(false)} />
          <Choice label={FEWER_POINTS} selected={fewerOn} onPress={() => setFewerOn((value) => !value)} />
          {trimEndsOn && !prepared.trimmed ? <T variant="muted">{LINE_TOO_SHORT}</T> : null}
          <Button label="Save this route" onPress={() => { void keepLine(); }} />
          <T variant="muted">{SAVE_ON_PHONE}</T>
          <T variant="muted">{SIGN_OUT_LINES}</T>
          {roomNote ? <T variant="muted">{roomNote}</T> : null}
        </Card>
        <Card>
          <T variant="label">Thumos</T>
          <T>{endedByLimit ? TIME_LIMIT_LINE : FINISH_LINE}</T>
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
    const guidePoints = live.guide ?? [];
    const planned = guideRoute(
      live.routeTitle && guidePoints.length >= 2 ? { title: live.routeTitle, points: guidePoints } : null,
    );
    const here = live.anchor
      ? { latitude: live.anchor.latitude, longitude: live.anchor.longitude }
      : null;
    const into = currentSplitLabel(live.distanceM);
    return (
      <Screen
        key="live"
        eyebrow={activityWord(live.activity)}
        title="Out"
        intro={LIVE_INTRO}
        footer={(
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label={live.paused ? 'Resume' : 'Pause'} onPress={pauseOrResume} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Stop" tone="quiet" onPress={() => { void endOuting('stop'); }} />
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
          <T variant="label">Heart rate</T>
          <T>{heartNow.label}{heartNow.label !== NO_HEART_SOURCE ? ' · Apple Watch' : ''}{heartNow.age ? ` · ${heartNow.age}` : ''}</T>
          {heartNow.label === NO_HEART_SOURCE ? <T variant="muted">{WATCH_HEART_HINT}</T> : null}
          {heartNow.warning ? <T variant="muted">{heartNow.warning}</T> : null}
          <T variant="muted">{HEART_FOREGROUND_LINE}</T>
          {live.splits.map((mark, index) => (
            <T key={mark.kilometre} variant="muted">{splitRow(mark, index === 0 ? 0 : live.splits[index - 1].movingMs)}</T>
          ))}
          {into ? <T variant="muted">{into}</T> : null}
          {live.triedFix && live.anchor == null && !live.denied ? <T variant="muted">{WAITING_FIX}</T> : null}
          {live.denied ? <T variant="muted">{LOCATION_FIX_MESSAGE}</T> : null}
          {live.paused ? <T variant="muted">{PAUSED_LINE}</T> : <T variant="muted">{TRACKING_ACTIVE_LINE}</T>}
          <T variant="label">Thumos</T>
          <T>{live.lastLine ?? quiet}</T>
          {live.spoken ? <T variant="muted">{AUDIO_DUCK_LINE}</T> : null}
          {live.spoken ? <T variant="muted">{SPEECH_GATE_NOTE}</T> : null}
          {live.routeTitle ? <T variant="muted">{guideLine(live.routeTitle)}</T> : null}
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
        <T variant="muted">{SAVED_LINE_ON_MAP}</T>
        <Choice label="No route" selected={routeId == null && phoneLineId == null} onPress={() => { setRouteId(null); setPhoneLineId(null); }} />
        {routes.map((route) => (
          <Choice key={route.id} label={route.title} selected={routeId === route.id} onPress={() => { setRouteId(route.id); setPhoneLineId(null); }} />
        ))}
        {phoneLines.length > 0 ? <T variant="label">{ON_THIS_PHONE}</T> : null}
        {phoneLines.length > 0 ? <T variant="muted">{SIGN_OUT_LINES}</T> : null}
        {phoneLines.map((line) => (
          <View key={line.id}>
            <Choice
              label={line.name}
              selected={phoneLineId === line.id}
              onPress={() => { setPhoneLineId(line.id); setRouteId(null); }}
            />
            <Button label="Delete" tone="quiet" onPress={() => { void removePhoneLine(line.id); }} />
          </View>
        ))}
        {phoneLines.length > 0 ? <T variant="muted">{PHONE_LINE_DELETE}</T> : null}
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
        ) : <T variant="muted">Off for this outing. The default on You stays as it is.</T>}
        <T variant="muted">The lines are written on this phone. Pace and time are filled in here. Nothing is sent.</T>
        {updatesOn && spoken ? <T variant="muted">{AUDIO_DUCK_LINE}</T> : null}
        {updatesOn && spoken ? <T variant="muted">{SPEECH_GATE_NOTE}</T> : null}
      </Card>
      <Card>
        <T>{beforeStartLine()}</T>
        <Button label="Start" onPress={start} />
        <Button label="Not now" tone="quiet" onPress={() => router.back()} />
        <T variant="muted">{ACTIVITY_LOCATION_LINE}</T>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      <ActivityGoodToKnow kind="setup" />
    </Screen>
  );
}
