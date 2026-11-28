import { useEffect, useMemo, useState } from 'react';

import {
  elevationGainMetres,
  matchRouteCompletions,
  savedRouteForMatch,
  workoutsForRouteMatch,
  type RouteCompletionHistory,
} from '@/domain/routeCompletions';
import type { OutdoorPoint, OutdoorRoute } from '@/domain/outdoorRoute';
import { useHealthSources } from '@/health/useHealthSources';
import { readDeviceRoute } from '@/health/workoutRoute';

type Trace = { start: OutdoorPoint | null; elevationGainM: number | null };

const EMPTY: RouteCompletionHistory = { byRoute: {}, all: [] };

/**
 * Saved routes against Garmin activities and Apple Health workouts.
 * Apple route traces are read on this phone when Health stored one.
 * Garmin does not keep a path, so a Garmin-only match stays likely.
 */
export function useRouteCompletionHistory(routes: readonly OutdoorRoute[]): {
  history: RouteCompletionHistory;
  ready: boolean;
} {
  const { readings, apple, ready } = useHealthSources();
  const [extras, setExtras] = useState<Readonly<Record<string, Trace>>>({});
  const routeKey = routes.map((route) => `${route.id}:${route.createdAt}:${route.distanceM}`).join('|');
  const appleKey = apple.map((workout) => `${workout.id}:${workout.startedAt}:${workout.routeExpected ? 1 : 0}`).join('|');

  useEffect(() => {
    let gone = false;
    if (!ready) return undefined;
    const earliest = routes.reduce<string | null>((min, route) => (
      min == null || route.createdAt < min ? route.createdAt : min
    ), null);
    const wanted = apple.filter((workout) => {
      if (!workout.routeExpected || !workout.id || workout.id.startsWith('garmin:')) return false;
      if (earliest != null && workout.startedAt < earliest) return false;
      return true;
    }).slice(0, 40);
    if (wanted.length === 0) {
      setExtras((current) => (Object.keys(current).length === 0 ? current : {}));
      return undefined;
    }
    void (async () => {
      const next: Record<string, Trace> = {};
      for (const workout of wanted) {
        if (gone) return;
        try {
          const read = await readDeviceRoute(workout.id);
          const first = read.points[0] ?? null;
          next[workout.id] = {
            start: first,
            elevationGainM: elevationGainMetres(read.points.map((point) => point.altitude)),
          };
        } catch {
          next[workout.id] = { start: null, elevationGainM: null };
        }
      }
      if (!gone) setExtras(next);
    })();
    return () => {
      gone = true;
    };
  }, [apple, appleKey, ready, routeKey, routes]);

  const history = useMemo(() => {
    if (!ready) return EMPTY;
    return matchRouteCompletions(
      routes.map(savedRouteForMatch),
      workoutsForRouteMatch({
        activities: readings.activities,
        activityDetails: readings.activityDetails ?? [],
        apple,
        extras,
      }),
    );
  }, [apple, extras, readings.activities, readings.activityDetails, ready, routes]);

  return { history, ready };
}
