import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { speakIfGated, stopSpeaking, TESTFLIGHT_SPEECH_ON } from '@/activity/speakLine';
import { acceptPauseTap, elapsedMs, pauseTiming, resumeTiming, type BreathTiming } from '@/domain/breathPause';
import {
  WIM_HOF_DEFAULT_ROUNDS,
  WIM_HOF_DONE_LINE,
  WIM_HOF_ROUND_CHOICES,
  WIM_HOF_SAFETY_LINE,
  WIM_HOF_SUMMARY,
  WIM_HOF_TITLE,
  buildWimHofPlan,
  wimHofAt,
  wimHofDoneSpoken,
  wimHofFigure,
  wimHofLengthText,
  wimHofScale,
  wimHofSpokenLine,
  wimHofTotalMs,
  type WimHofRounds,
  type WimHofStep,
} from '@/domain/wimHof';
import { MeasureRingView } from '@/ui/MeasuredFigure';
import { Button, Card, Choice, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

const KEEP_AWAKE_TAG = 'charioteer-breathe';
const TICK_MS = 50;

type Status = 'idle' | 'running' | 'paused' | 'done';

function idleClock(totalMs: number): BreathTiming {
  return { phaseMs: totalMs, carriedMs: 0, startedAt: null };
}

export function WimHofBreathing() {
  const theme = useAppTheme();
  const [rounds, setRounds] = useState<WimHofRounds>(WIM_HOF_DEFAULT_ROUNDS);
  const [spoken, setSpoken] = useState(TESTFLIGHT_SPEECH_ON);
  const plan = useMemo(() => buildWimHofPlan(rounds), [rounds]);
  const totalMs = wimHofTotalMs(plan);
  const [status, setStatus] = useState<Status>('idle');
  const [nowMs, setNowMs] = useState(0);
  const clockRef = useRef<BreathTiming>(idleClock(totalMs));
  const lastTapRef = useRef<number | null>(null);
  const lastIndexRef = useRef(-1);
  const statusRef = useRef<Status>('idle');
  const spokenRef = useRef(spoken);
  spokenRef.current = spoken;

  function setBoth(next: Status) {
    statusRef.current = next;
    setStatus(next);
  }

  function cueStep(step: WimHofStep) {
    if (Platform.OS !== 'web') {
      const style = step.cue === 'out' ? Haptics.ImpactFeedbackStyle.Soft : step.cue === 'ready' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium;
      void Haptics.impactAsync(style);
    }
    const line = wimHofSpokenLine(step, rounds);
    if (line) speakIfGated(line, spokenRef.current);
  }

  // One session clock. Each tick asks the plan where the clock sits, so a pause never loses the place.
  useEffect(() => {
    if (status !== 'running') return undefined;
    const tick = setInterval(() => {
      if (statusRef.current !== 'running') return;
      const now = Date.now();
      const position = wimHofAt(plan, elapsedMs(clockRef.current, now));
      if (position.done) {
        clockRef.current = pauseTiming(clockRef.current, now);
        setBoth('done');
        lastIndexRef.current = -1;
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        speakIfGated(wimHofDoneSpoken(), spokenRef.current);
        setNowMs(now);
        return;
      }
      if (position.index !== lastIndexRef.current) {
        lastIndexRef.current = position.index;
        cueStep(position.step);
      }
      setNowMs(now);
    }, TICK_MS);
    return () => clearInterval(tick);
    // cueStep reads the latest rounds and spoken choice through refs and the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, plan]);

  // Keep the screen on only while the breathing is running.
  useEffect(() => {
    if (status !== 'running') return undefined;
    let gone = false;
    void import('expo-keep-awake').then(async (mod) => {
      if (gone) return;
      try {
        await mod.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      } catch {
        // A browser can refuse the wake lock.
      }
    }).catch(() => undefined);
    return () => {
      gone = true;
      void import('expo-keep-awake').then((mod) => mod.deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => undefined);
    };
  }, [status]);

  useEffect(() => () => {
    statusRef.current = 'idle';
    stopSpeaking();
  }, []);

  function onPress() {
    const now = Date.now();
    if (!acceptPauseTap(lastTapRef.current, now)) return;
    lastTapRef.current = now;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (statusRef.current === 'running') {
      clockRef.current = pauseTiming(clockRef.current, now);
      stopSpeaking();
      setNowMs(now);
      setBoth('paused');
      return;
    }
    if (statusRef.current === 'idle' || statusRef.current === 'done') {
      clockRef.current = { ...idleClock(totalMs), startedAt: now };
      lastIndexRef.current = -1;
    } else {
      clockRef.current = resumeTiming(clockRef.current, now);
    }
    setNowMs(now);
    setBoth('running');
  }

  function stop() {
    stopSpeaking();
    clockRef.current = idleClock(totalMs);
    lastIndexRef.current = -1;
    lastTapRef.current = null;
    setBoth('idle');
  }

  const position = wimHofAt(plan, status === 'idle' ? 0 : elapsedMs(clockRef.current, nowMs));
  const started = status === 'running' || status === 'paused';
  const scale = started ? wimHofScale(position) : 0.72;
  const size = 150 + (scale - 0.68) * (80 / 0.32);
  const control = status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : status === 'done' ? 'Start again' : 'Begin';

  return (
    <Card>
      <T variant="title">{WIM_HOF_TITLE}</T>
      <T variant="muted">{WIM_HOF_SUMMARY}</T>
      {started ? (
        <MeasureRingView label={position.step.breath != null ? 'Breath' : 'This step'} ring={wimHofFigure(position, rounds)} />
      ) : null}
      {status === 'idle' ? (
        <>
          <T variant="label">Rounds</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {WIM_HOF_ROUND_CHOICES.map((value) => (
              <View key={value} style={{ flex: 1 }}>
                <Choice label={`${value} rounds, ${wimHofLengthText(value)}`} selected={rounds === value} onPress={() => setRounds(value)} />
              </View>
            ))}
          </View>
          {TESTFLIGHT_SPEECH_ON ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Choice label="Spoken and on screen" selected={spoken} onPress={() => setSpoken(true)} /></View>
              <View style={{ flex: 1 }}><Choice label="On screen only" selected={!spoken} onPress={() => setSpoken(false)} /></View>
            </View>
          ) : null}
          <View style={{ borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.md, padding: 12, gap: 4 }}>
            <T variant="label">Before you start</T>
            <T>{WIM_HOF_SAFETY_LINE}</T>
          </View>
        </>
      ) : null}
      {status === 'done' ? <T>{WIM_HOF_DONE_LINE}</T> : null}
      {started ? (
        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${position.step.label}. ${position.step.hint}`}
            style={{ width: size, height: size, borderRadius: 999, backgroundColor: theme.colors.ink, alignItems: 'center', justifyContent: 'center', padding: 12 }}
          >
            <T variant="title" style={{ color: theme.colors.bg, textAlign: 'center' }}>{status === 'paused' ? 'Paused' : position.step.label}</T>
            <T variant="label" style={{ color: theme.colors.bg, textAlign: 'center' }}>{position.step.hint}</T>
          </View>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={control}
        onPressIn={onPress}
        hitSlop={8}
        style={({ pressed }) => ({
          minHeight: 52,
          minWidth: 44,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 18,
          backgroundColor: pressed ? theme.colors.muted : theme.colors.ink,
          opacity: pressed ? 0.86 : 1,
        })}
      >
        <T style={{ color: theme.colors.bg, fontFamily: theme.font.bodyStrong }}>{control}</T>
      </Pressable>
      {started ? <Button label="Stop" tone="quiet" onPress={stop} /> : null}
    </Card>
  );
}
