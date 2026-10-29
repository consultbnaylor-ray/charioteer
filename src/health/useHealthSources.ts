import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import type { HealthSample } from '@/data/types';
import { emptyGarminReadings, type GarminReadings } from '@/domain/garminConnect';
import { mergeHealthSamples, mergeWorkouts } from '@/domain/healthSources';
import type { DeviceWorkout } from '@/domain/workoutRoute';
import { listDeviceWorkouts } from '@/health/workoutRoute';
import { rememberWorkouts } from '@/health/workoutRouteMemory';

/** Apple Health and Garmin, already merged into the series the charts read. */
export function useHealthSources(): {
  readings: GarminReadings;
  workouts: DeviceWorkout[];
  samples: HealthSample[];
} {
  const snap = useSnapshot();
  const repo = useRepository();
  const [readings, setReadings] = useState<GarminReadings>(emptyGarminReadings);
  const [apple, setApple] = useState<DeviceWorkout[]>([]);

  useFocusEffect(useCallback(() => {
    let live = true;
    void repo.loadGarmin().then((next) => {
      if (live) setReadings(next);
    }).catch(() => {
      if (live) setReadings(emptyGarminReadings());
    });
    void listDeviceWorkouts().then((next) => {
      if (live) setApple(next);
    }).catch(() => {
      if (live) setApple([]);
    });
    return () => {
      live = false;
    };
  }, [repo]));

  const workouts = useMemo(() => mergeWorkouts(apple, readings.activities), [apple, readings]);
  const samples = useMemo(
    () => mergeHealthSamples(snap.health, readings, workouts),
    [snap.health, readings, workouts],
  );

  useEffect(() => {
    rememberWorkouts(workouts);
  }, [workouts]);

  return { readings, workouts, samples };
}
