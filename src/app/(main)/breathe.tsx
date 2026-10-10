import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

import { BREATH_EXERCISES, URGE_SURF_STEPS, type BreathExercise } from '@/features/exercises';
import { Button, Card, Choice, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

export default function Breathe() {
  const params = useLocalSearchParams<{ exercise?: string }>();
  const initial = BREATH_EXERCISES.find((item) => item.id === params.exercise)?.id ?? 'box';
  const [selected, setSelected] = useState(initial === 'box' && params.exercise === 'surf' ? 'surf' : params.exercise === 'surf' ? 'surf' : initial);
  const exercise = BREATH_EXERCISES.find((item) => item.id === selected);

  return (
    <Screen eyebrow="Practice" title="Settle the body." intro="Box breathing, 4-7-8, a physiological sigh, or a short urge-surf. Haptics play on a phone, not in the browser.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {BREATH_EXERCISES.map((item) => (
          <Choice key={item.id} label={item.title} selected={selected === item.id} onPress={() => setSelected(item.id)} />
        ))}
        <Choice label="Urge surfing" selected={selected === 'surf'} onPress={() => setSelected('surf')} />
      </View>
      {selected === 'surf' ? <UrgeSurf /> : exercise ? <BreathRunner exercise={exercise} /> : null}
    </Screen>
  );
}

function BreathRunner({ exercise }: { exercise: BreathExercise }) {
  const theme = useAppTheme();
  const scale = useRef(new Animated.Value(0.72)).current;
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(exercise.phases[0].seconds);
  const phase = exercise.phases[phaseIndex] ?? exercise.phases[0];

  useEffect(() => {
    setPhaseIndex(0);
    setLeft(exercise.phases[0].seconds);
    setRunning(false);
    scale.setValue(0.72);
  }, [exercise, scale]);

  useEffect(() => {
    if (!running) return;
    Animated.timing(scale, {
      toValue: phase.scale,
      duration: phase.seconds * 1000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
    if (Platform.OS !== 'web') {
      const style = phase.cue === 'out' ? Haptics.ImpactFeedbackStyle.Soft : Haptics.ImpactFeedbackStyle.Medium;
      void Haptics.impactAsync(style);
    }
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, phase.seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        setPhaseIndex((index) => (index + 1) % exercise.phases.length);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [running, phaseIndex, exercise, phase, scale]);

  const size = scale.interpolate({ inputRange: [0.68, 1], outputRange: [150, 230] });

  return (
    <Card>
      <T variant="title">{exercise.title}</T>
      <T variant="muted">{exercise.summary}</T>
      <View style={{ alignItems: 'center', paddingVertical: 18 }}>
        <Animated.View style={{ width: size, height: size, borderRadius: 999, backgroundColor: theme.colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <T variant="title" style={{ color: theme.colors.bg, textAlign: 'center' }}>{running ? phase.label : 'Ready'}</T>
          <T variant="label" style={{ color: theme.colors.bg }}>{running ? `${left}s` : `${phase.seconds}s`}</T>
        </Animated.View>
      </View>
      <Button label={running ? 'Pause' : 'Begin'} onPress={() => setRunning((value) => !value)} />
    </Card>
  );
}

function UrgeSurf() {
  const [step, setStep] = useState(0);
  const current = URGE_SURF_STEPS[step];
  return (
    <Card>
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
