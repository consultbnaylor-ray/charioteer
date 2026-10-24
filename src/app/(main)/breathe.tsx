import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';

import {
  acceptPauseTap,
  beginPhase,
  idlePhase,
  isPhaseDone,
  pauseTiming,
  phaseProgress,
  remainingMs,
  remainingSeconds,
  resumeTiming,
  scaleAtProgress,
  type BreathTiming,
} from '@/domain/breathPause';
import { BREATH_EXERCISES, URGE_SURF_STEPS, type BreathExercise, type BreathPhase } from '@/features/exercises';
import { breathPhaseFigure, urgeStepFigure } from '@/domain/measureFigures';
import { MeasureRingView } from '@/ui/MeasuredFigure';
import { Button, Card, Choice, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

export default function Breathe() {
  const params = useLocalSearchParams<{ exercise?: string }>();
  const initial = BREATH_EXERCISES.find((item) => item.id === params.exercise)?.id ?? 'box';
  const [selected, setSelected] = useState(initial === 'box' && params.exercise === 'surf' ? 'surf' : params.exercise === 'surf' ? 'surf' : initial);
  const exercise = BREATH_EXERCISES.find((item) => item.id === selected);

  return (
    <Screen eyebrow="Practice" title="Settle the body." intro="Box breathing, 4-7-8, a physiological sigh, or a short urge-surf. Haptics play on a phone, not in the browser.">
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BREATH_EXERCISES.map((item) => (
            <Choice key={item.id} label={item.title} selected={selected === item.id} onPress={() => setSelected(item.id)} />
          ))}
          <Choice label="Urge surfing" selected={selected === 'surf'} onPress={() => setSelected('surf')} />
        </View>
      </Card>
      {selected === 'surf' ? <UrgeSurf /> : exercise ? <BreathRunner exercise={exercise} /> : null}
    </Screen>
  );
}

const REST_SCALE = 0.72;

function BreathRunner({ exercise }: { exercise: BreathExercise }) {
  const theme = useAppTheme();
  const scale = useRef(new Animated.Value(REST_SCALE)).current;
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(exercise.phases[0].seconds);
  const timingRef = useRef<BreathTiming>(idlePhase(exercise.phases[0].seconds));
  const runningRef = useRef(false);
  const phaseIndexRef = useRef(0);
  const exerciseRef = useRef(exercise);
  const originRef = useRef(REST_SCALE);
  const frozenScale = useRef(REST_SCALE);
  const lastTapRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const stopTokenRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  exerciseRef.current = exercise;
  const phase = exercise.phases[phaseIndex] ?? exercise.phases[0];

  function haltMotion() {
    generationRef.current += 1;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (endRef.current) {
      clearTimeout(endRef.current);
      endRef.current = null;
    }
    animRef.current?.stop();
    animRef.current = null;
    const token = ++stopTokenRef.current;
    scale.stopAnimation((value) => {
      if (token !== stopTokenRef.current) return;
      const next = typeof value === 'number' ? value : frozenScale.current;
      frozenScale.current = next;
      scale.setValue(next);
    });
  }

  function cue(next: BreathPhase, fresh: boolean) {
    if (!fresh || Platform.OS === 'web') return;
    const style = next.cue === 'out' ? Haptics.ImpactFeedbackStyle.Soft : Haptics.ImpactFeedbackStyle.Medium;
    void Haptics.impactAsync(style);
  }

  function arm(timing: BreathTiming, from: number, to: number, index: number) {
    const now = timing.startedAt ?? Date.now();
    const duration = remainingMs(timing, now);
    const generation = generationRef.current;
    originRef.current = from;
    frozenScale.current = from;
    stopTokenRef.current += 1;
    scale.setValue(from);
    if (duration <= 0) {
      finishPhase(generation, index);
      return;
    }
    const animation = Animated.timing(scale, {
      toValue: to,
      duration,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    });
    animRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished || !runningRef.current || generation !== generationRef.current) return;
      finishPhase(generation, index);
    });
    tickRef.current = setInterval(() => {
      if (!runningRef.current || generation !== generationRef.current) return;
      const tickNow = Date.now();
      const current = timingRef.current;
      setLeft(remainingSeconds(current, tickNow));
      const progress = phaseProgress(current, tickNow);
      if (!animRef.current) {
        scale.setValue(scaleAtProgress(originRef.current, to, progress));
      }
      if (isPhaseDone(current, tickNow)) finishPhase(generation, index);
    }, 50);
    endRef.current = setTimeout(() => {
      if (!runningRef.current || generation !== generationRef.current) return;
      finishPhase(generation, index);
    }, duration);
  }

  function finishPhase(generation: number, index: number) {
    if (!runningRef.current || generation !== generationRef.current) return;
    const phases = exerciseRef.current.phases;
    const nextIndex = (index + 1) % phases.length;
    const next = phases[nextIndex];
    haltMotion();
    if (!runningRef.current) return;
    phaseIndexRef.current = nextIndex;
    setPhaseIndex(nextIndex);
    const now = Date.now();
    const timing = beginPhase(next.seconds, now);
    timingRef.current = timing;
    setLeft(next.seconds);
    const from = phases[index].scale;
    frozenScale.current = from;
    cue(next, true);
    arm(timing, from, next.scale, nextIndex);
  }

  function pause(now: number) {
    runningRef.current = false;
    setRunning(false);
    timingRef.current = pauseTiming(timingRef.current, now);
    setLeft(remainingSeconds(timingRef.current, now));
    haltMotion();
  }

  function resume(now: number) {
    const current = exerciseRef.current.phases[phaseIndexRef.current] ?? exerciseRef.current.phases[0];
    const timing = resumeTiming(timingRef.current, now);
    timingRef.current = timing;
    runningRef.current = true;
    setRunning(true);
    setStarted(true);
    const fresh = timing.carriedMs === 0;
    cue(current, fresh);
    arm(timing, frozenScale.current, current.scale, phaseIndexRef.current);
  }

  function onPress() {
    const now = Date.now();
    if (!acceptPauseTap(lastTapRef.current, now)) return;
    lastTapRef.current = now;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (runningRef.current) pause(now);
    else resume(now);
  }

  useEffect(() => {
    haltMotion();
    runningRef.current = false;
    phaseIndexRef.current = 0;
    lastTapRef.current = null;
    originRef.current = REST_SCALE;
    frozenScale.current = REST_SCALE;
    scale.setValue(REST_SCALE);
    timingRef.current = idlePhase(exercise.phases[0].seconds);
    stopTokenRef.current += 1;
    setPhaseIndex(0);
    setRunning(false);
    setStarted(false);
    setLeft(exercise.phases[0].seconds);
    return () => {
      runningRef.current = false;
      haltMotion();
    };
    // Reset only when the exercise changes. haltMotion closes over the latest refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise]);

  const size = scale.interpolate({ inputRange: [0.68, 1], outputRange: [150, 230] });
  const control = running ? 'Pause' : started ? 'Resume' : 'Begin';

  return (
    <Card>
      <T variant="title">{exercise.title}</T>
      <T variant="muted">{exercise.summary}</T>
      <MeasureRingView
        label="This breath"
        ring={breathPhaseFigure(started ? left : phase.seconds, phase.seconds, started ? phase.label : 'Ready')}
      />
      <View style={{ alignItems: 'center', paddingVertical: 18 }}>
        <Animated.View style={{ width: size, height: size, borderRadius: 999, backgroundColor: theme.colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <T variant="title" style={{ color: theme.colors.bg, textAlign: 'center' }}>{started ? phase.label : 'Ready'}</T>
          <T variant="label" style={{ color: theme.colors.bg }}>{started ? `${left}s` : `${phase.seconds}s`}</T>
        </Animated.View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={control}
        onPressIn={onPress}
        onPress={onPress}
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
    </Card>
  );
}

function UrgeSurf() {
  const [step, setStep] = useState(0);
  const current = URGE_SURF_STEPS[step];
  return (
    <Card>
      <MeasureRingView label="Urge surfing" ring={urgeStepFigure(step + 1, URGE_SURF_STEPS.length, current.title)} />
      <T variant="label">Step {step + 1} of {URGE_SURF_STEPS.length}</T>
      <T variant="title">{current.title}</T>
      <T>{current.body}</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button label="Back" tone="quiet" onPress={() => setStep((value) => value - 1)} /></View> : null}
        <View style={{ flex: 1 }}>
          <Button
            label={step === URGE_SURF_STEPS.length - 1 ? 'Start again' : 'Next'}
            onPress={() => setStep((value) => (value === URGE_SURF_STEPS.length - 1 ? 0 : value + 1))}
          />
        </View>
      </View>
    </Card>
  );
}
