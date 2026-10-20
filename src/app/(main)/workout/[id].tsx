import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatUkCompactWhen } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import {
  ROUTE_PURPOSE,
  buildRouteStats,
  elevationLine,
  formatClock,
  type DeviceWorkout,
  type DistanceUnit,
  type RoutePoint,
  type RouteSplit,
} from '@/domain/workoutRoute';
import { loadDistanceUnit, saveDistanceUnit } from '@/health/distanceUnit';
import { readDeviceRoute } from '@/health/workoutRoute';
import { RouteMap } from '@/ui/RouteMap';
import { useAppTheme } from '@/ui/theme';
import { Button, Choice, ErrorNote, Screen, T } from '@/ui/ui';

function splitCopy(split: RouteSplit): string[] {
  return [
    split.label,
    `Time ${formatClock(split.timeSeconds)}`,
    `Pace ${split.paceLabel}`,
    split.heartRate == null ? 'Heart rate not available' : `Heart rate ${split.heartRate} bpm`,
    elevationLine(split.elevationMetres),
  ];
}

export default function WorkoutRouteScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = raw ? decodeURIComponent(raw) : '';
  const router = useRouter();
  const theme = useAppTheme();
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const [workout, setWorkout] = useState<DeviceWorkout | null>(null);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadDistanceUnit().then(setUnit);
  }, []);

  useEffect(() => {
    if (!id) return;
    let live = true;
    setReady(false);
    setError(null);
    void readDeviceRoute(id).then((result) => {
      if (!live) return;
      setWorkout(result.workout);
      setPoints(result.points);
      setDenied(result.denied);
      setReady(true);
    }).catch((err: unknown) => {
      if (!live) return;
      setError(shownError(err, 'Could not read that route.'));
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [id]);

  const stats = points.length > 1
    ? buildRouteStats({
      points,
      unit,
      durationSeconds: workout ? workout.durationMinutes * 60 : null,
      energyKcal: workout?.energyKcal,
      averageHeartRate: workout?.averageHeartRate,
    })
    : null;
  const active = selected == null || !stats
    ? []
    : points.slice(stats.splits[selected]?.startIndex ?? 0, (stats.splits[selected]?.endIndex ?? 0) + 1);

  async function chooseUnit(next: DistanceUnit) {
    setUnit(next);
    setSelected(null);
    await saveDistanceUnit(next);
  }

  return (
    <Screen
      eyebrow="Workouts"
      title={workout?.label ?? 'Workout'}
      intro={workout ? formatUkCompactWhen(workout.startedAt) : 'The path stays on this iPhone.'}
    >
      <Button label="Back" tone="quiet" onPress={() => router.back()} />
      <T>{ROUTE_PURPOSE}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="Kilometres" selected={unit === 'km'} onPress={() => { void chooseUnit('km'); }} />
        <Choice label="Miles" selected={unit === 'mile'} onPress={() => { void chooseUnit('mile'); }} />
      </View>
      <ErrorNote>{error}</ErrorNote>
      {denied ? <T>Workout routes are off. Turn them on in the Health app: profile picture, Privacy, Apps, Charioteer.</T> : null}
      {!ready ? <T variant="muted">Reading the route on this iPhone.</T> : null}
      {ready && !denied && points.length < 2 ? (
        <T>{workout?.routeExpected ? 'No route stored for this workout yet.' : 'This workout has no GPS route.'}</T>
      ) : null}
      {stats ? (
        <View style={{ gap: 8 }}>
          <RouteMap points={points} active={active.length > 1 ? active : points} />
          <T>{stats.distanceLabel}</T>
          <T>{stats.durationLabel}</T>
          <T>{stats.paceLabel}</T>
          <T>{stats.heartLabel}</T>
          {stats.calorieLabel ? <T>{stats.calorieLabel}</T> : null}
          <T variant="label">Splits</T>
          {stats.splits.map((split, index) => {
            const on = selected === index;
            return (
              <Pressable
                key={split.index}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Split ${split.index}, ${splitCopy(split).join(', ')}`}
                onPress={() => setSelected(on ? null : index)}
                style={{
                  gap: 2,
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.line,
                  backgroundColor: on ? theme.colors.emphasisSoft : 'transparent',
                }}
              >
                <T style={{ fontFamily: theme.font.bodyStrong }}>{on ? `Split ${split.index} · Selected` : `Split ${split.index}`}</T>
                {splitCopy(split).map((line) => <T key={line}>{line}</T>)}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}
