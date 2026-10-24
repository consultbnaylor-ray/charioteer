import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository } from '@/data';
import { clientAppBuild } from '@/domain/clientError';
import { formatUkCompactWhen } from '@/domain/dates';
import {
  ROUTE_LOAD_ERROR,
  ROUTE_MAP_TIMEOUT_MS,
  ROUTE_NONE,
  ROUTE_PURPOSE,
  ROUTE_READ_TIMEOUT,
  ROUTE_READING,
  ROUTE_RETRY,
  buildRouteStats,
  downsampleRoute,
  elevationLine,
  formatClock,
  routeEmptyCopy,
  routeErrorLine,
  routeMapRegion,
  routeRetryVisible,
  routeUnavailable,
  type DeviceWorkout,
  type DistanceUnit,
  type HeartSample,
  type RoutePoint,
  type RouteSplit,
} from '@/domain/workoutRoute';
import { loadDistanceUnit, saveDistanceUnit } from '@/health/distanceUnit';
import { workoutSourceLine } from '@/domain/healthSources';
import { readDeviceRoute } from '@/health/workoutRoute';
import { RouteBoundary } from '@/ui/RouteBoundary';
import { RouteMap } from '@/ui/RouteMap';
import { IconLine, type StatIcon } from '@/ui/statIcons';
import { useAppTheme } from '@/ui/theme';
import { Button, Choice, Screen, T } from '@/ui/ui';

function StatRows({ stats }: { stats: NonNullable<ReturnType<typeof buildRouteStats>> }) {
  const rows: { icon: StatIcon; label: string; text: string; muted?: boolean }[] = [
    { icon: 'ruler', label: 'Distance', text: stats.distanceLabel, muted: !stats.distanceRecorded },
    { icon: 'timer', label: 'Duration', text: stats.durationLabel },
    { icon: 'gauge', label: 'Average pace', text: stats.paceLabel, muted: !stats.paceRecorded },
    { icon: 'heart', label: 'Average heart rate', text: stats.heartLabel },
  ];
  if (stats.calorieLabel) rows.push({ icon: 'flame', label: 'Calories', text: stats.calorieLabel });
  return (
    <View style={{ gap: 2 }}>
      {rows.map((row) => (
        <IconLine key={row.label} name={row.icon} label={row.label} muted={row.muted}>
          {row.text}
        </IconLine>
      ))}
    </View>
  );
}

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
  return <WorkoutRouteBody />;
}

function WorkoutRouteBody() {
  const params = useLocalSearchParams<{ id?: string }>();
  const repo = useRepository();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = raw ? decodeURIComponent(raw) : '';
  const router = useRouter();
  const theme = useAppTheme();
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const [workout, setWorkout] = useState<DeviceWorkout | null>(null);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [samples, setSamples] = useState<HeartSample[]>([]);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [mapLine, setMapLine] = useState<string | null>(null);
  const reported = useRef(new Set<string>());

  function report(error: unknown) {
    const line = routeErrorLine(error);
    if (reported.current.has(line)) return;
    reported.current.add(line);
    setMapLine(line);
    void repo.logClientError('workout-route', line, clientAppBuild({
      buildNumber: Constants.expoConfig?.ios?.buildNumber,
      version: Constants.expoConfig?.version,
    })).catch(() => undefined);
  }

  useEffect(() => {
    void loadDistanceUnit().then(setUnit);
  }, []);

  useEffect(() => {
    reported.current.clear();
    setMapLine(null);
    if (!id) {
      setReady(true);
      setFailed(true);
      setPoints([]);
      setSamples([]);
      report('No workout was opened.');
      return;
    }
    let live = true;
    let settled = false;
    setReady(false);
    setFailed(false);
    const timer = setTimeout(() => {
      if (!live || settled) return;
      settled = true;
      setFailed(true);
      setPoints([]);
      setSamples([]);
      setReady(true);
      report(ROUTE_READ_TIMEOUT);
    }, ROUTE_MAP_TIMEOUT_MS);
    void readDeviceRoute(id).then((result) => {
      if (!live || settled) return;
      settled = true;
      clearTimeout(timer);
      setWorkout(result.workout);
      setPoints(downsampleRoute(result.points));
      setSamples(result.heartSamples ?? []);
      setDenied(result.denied);
      setReady(true);
    }).catch((err: unknown) => {
      if (!live || settled) return;
      settled = true;
      clearTimeout(timer);
      setFailed(true);
      setPoints([]);
      setSamples([]);
      setReady(true);
      report(err);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [attempt, id, repo]);

  const stats = workout || points.length > 0
    ? buildRouteStats({
      points,
      unit,
      durationSeconds: workout ? workout.durationMinutes * 60 : null,
      energyKcal: workout?.energyKcal,
      averageHeartRate: workout?.averageHeartRate,
      heartSamples: samples,
      distanceMetres: workout?.distanceMetres,
    })
    : null;
  const sourceLine = workoutSourceLine(workout?.origin);
  const drawable = routeMapRegion(points) != null;
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
      {sourceLine ? <T variant="muted">{sourceLine}</T> : null}
      <RouteBoundary onError={report}>
      <T>{ROUTE_PURPOSE}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="Kilometres" selected={unit === 'km'} onPress={() => { void chooseUnit('km'); }} />
        <Choice label="Miles" selected={unit === 'mile'} onPress={() => { void chooseUnit('mile'); }} />
      </View>
      {!ready ? <T variant="muted">{ROUTE_READING}</T> : null}
      {routeUnavailable({ ready, denied, failed, mapLine: mapLine != null, drawable }) ? (
        <View style={{ gap: 8 }}>
          <T>{ROUTE_LOAD_ERROR}</T>
          {routeRetryVisible({ failed, mapLine: mapLine != null }) ? <Button label={ROUTE_RETRY} onPress={() => setAttempt((value) => value + 1)} /> : null}
        </View>
      ) : null}
      {routeEmptyCopy({ ready, failed, mapLine: mapLine != null, points: points.length }) ? <T>{ROUTE_NONE}</T> : null}
      {stats ? (
        <View style={{ gap: 8 }}>
          {mapLine || failed || !drawable ? null : (
            <RouteBoundary onError={report}>
              <RouteMap points={points} active={active.length > 1 ? active : points} onProblem={report} />
            </RouteBoundary>
          )}
          <StatRows stats={stats} />
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
      </RouteBoundary>
    </Screen>
  );
}
