import { useState } from 'react';
import { View } from 'react-native';

import {
  ROUTE_MATCH_EMPTY,
  routeCompletionStatLine,
  routeCompletionSummaryLine,
  routeHistorySummary,
  routeHistorySummaryLine,
  type RouteCompletion,
} from '@/domain/routeCompletions';
import { ExpandableRow } from '@/ui/ExpandableRow';
import { T } from '@/ui/ui';

/** Total completions, and the recorded distance from this month. */
export function RouteHistorySummary({
  completions,
  ready,
}: {
  completions: readonly RouteCompletion[];
  ready: boolean;
}) {
  if (!ready) return <T variant="muted">Checking recorded workouts.</T>;
  return <T>{routeHistorySummaryLine(routeHistorySummary(completions))}</T>;
}

/** One route's wearable matches. Stats stay behind the chevron. */
export function RouteCompletionRows({
  completions,
  ready,
}: {
  completions: readonly RouteCompletion[];
  ready: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!ready) return <T variant="muted">Checking recorded workouts.</T>;
  if (completions.length === 0) return <T variant="muted">{ROUTE_MATCH_EMPTY}</T>;
  const ordered = [...completions].sort((left, right) => (left.startedAt < right.startedAt ? 1 : left.startedAt > right.startedAt ? -1 : 0));
  const label = routeCompletionSummaryLine(ordered);
  return (
    <View style={{ gap: 8 }}>
      <ExpandableRow
        label={label}
        accessibilityLabel={label}
        expanded={open}
        onPress={() => setOpen((value) => !value)}
        variant="divider"
      />
      {open ? ordered.map((row) => (
        <T key={row.workoutId} variant="muted">{routeCompletionStatLine(row)}</T>
      )) : null}
    </View>
  );
}
