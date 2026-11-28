import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { useRepository, useSnapshot } from '@/data';
import type { HealthSample } from '@/data/types';
import { emptyAppleDailyActivity, type AppleDailyActivity } from '@/domain/dailyActivity';
import { emptyGarminReadings, type GarminReadings } from '@/domain/garminConnect';
import { mergeHealthSamples, mergeWorkouts } from '@/domain/healthSources';
import type { DeviceWorkout } from '@/domain/workoutRoute';
import { listDailyActivity } from '@/health/dailyActivity';
import { listDeviceWorkouts } from '@/health/workoutRoute';
import { rememberWorkouts } from '@/health/workoutRouteMemory';

type SourceCache = {
  readings: GarminReadings;
  apple: DeviceWorkout[];
  activity: AppleDailyActivity;
  ready: boolean;
};

type SourceRepo = {
  loadGarmin: () => Promise<GarminReadings>;
};

let cache: SourceCache = {
  readings: emptyGarminReadings(),
  apple: [],
  activity: emptyAppleDailyActivity(),
  ready: false,
};
let cacheSignature = sourceSignature(cache);
const listeners = new Set<() => void>();
let flight: Promise<void> | null = null;
let flightToken = 0;
let lastRepo: SourceRepo | null = null;
let lastConsent = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCache(): SourceCache {
  return cache;
}

function sourceSignature(value: SourceCache): string {
  const daily = value.readings.dailies[value.readings.dailies.length - 1];
  const metric = value.readings.userMetrics[value.readings.userMetrics.length - 1];
  const workout = value.apple[value.apple.length - 1];
  const minutes = value.activity.exerciseMinutes[value.activity.exerciseMinutes.length - 1];
  const energy = value.activity.activeKcal[value.activity.activeKcal.length - 1];
  return [
    value.readings.connected ? 1 : 0,
    value.readings.lastPushAt ?? '',
    value.readings.dailies.length,
    daily?.calendarDate ?? '',
    daily?.steps ?? '',
    daily?.distanceMetres ?? '',
    daily?.restingHeartRateBpm ?? '',
    daily?.moderateMinutes ?? '',
    daily?.vigorousMinutes ?? '',
    value.readings.activities.length,
    value.readings.sleep.length,
    value.readings.hrv.length,
    value.readings.userMetrics.length,
    metric?.vo2Max ?? '',
    value.apple.length,
    workout?.id ?? '',
    workout?.startedAt ?? '',
    value.activity.exerciseMinutes.length,
    minutes?.day ?? '',
    minutes?.value ?? '',
    value.activity.activeKcal.length,
    energy?.day ?? '',
    energy?.value ?? '',
    value.ready ? 1 : 0,
  ].join('|');
}

function refreshHealthSources(repo: SourceRepo, consent: boolean, force = false): Promise<void> {
  lastRepo = repo;
  lastConsent = consent;
  if (flight && !force) return flight;
  const token = ++flightToken;
  let activityPromise: Promise<AppleDailyActivity>;
  if (!consent) activityPromise = Promise.resolve(emptyAppleDailyActivity());
  else activityPromise = listDailyActivity().catch(() => emptyAppleDailyActivity());
  const run = Promise.all([
    repo.loadGarmin().catch(() => emptyGarminReadings()),
    listDeviceWorkouts().catch(() => [] as DeviceWorkout[]),
    activityPromise,
  ]).then(([readings, apple, activity]) => {
    if (token !== flightToken) return;
    const next = { readings, apple, activity, ready: true };
    const signature = sourceSignature(next);
    if (signature === cacheSignature) return;
    cache = next;
    cacheSignature = signature;
    emit();
  }).finally(() => {
    if (flight === run) flight = null;
  });
  flight = run;
  return run;
}

/** Ask every open health screen to read Apple Health workouts and Garmin again. */
export function reloadHealthSources(): void {
  if (!lastRepo) return;
  void refreshHealthSources(lastRepo, lastConsent, true);
}

/** Apple Health and Garmin, already merged into the series the charts read. */
export function useHealthSources(): {
  readings: GarminReadings;
  workouts: DeviceWorkout[];
  samples: HealthSample[];
  activity: AppleDailyActivity;
  /** Apple Health workouts before they are merged with Garmin. */
  apple: DeviceWorkout[];
  ready: boolean;
} {
  const snap = useSnapshot();
  const repo = useRepository();
  const consent = Boolean(snap.profile?.consentHealth);
  const cached = useSyncExternalStore(subscribe, getCache, getCache);

  useFocusEffect(useCallback(() => {
    void refreshHealthSources(repo, consent);
  }, [consent, repo]));

  const workouts = useMemo(() => mergeWorkouts(cached.apple, cached.readings.activities), [cached]);
  const samples = useMemo(
    () => mergeHealthSamples(snap.health, cached.readings, workouts),
    [snap.health, cached, workouts],
  );

  useEffect(() => {
    rememberWorkouts(workouts);
  }, [workouts]);

  return {
    readings: cached.readings,
    workouts,
    samples,
    activity: cached.activity,
    apple: cached.apple,
    ready: cached.ready,
  };
}
