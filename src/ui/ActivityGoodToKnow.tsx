import {
  ACTIVITY_LOCATION_LINE,
  BATTERY_NOTE,
  TRAFFIC_LINE,
} from '@/domain/activitySession';
import {
  OUTSIDE_CRISIS_LINE,
  OUTSIDE_SAFETY_LINE,
  PATH_LINE,
  ROUTE_SAFETY_LINE,
} from '@/domain/outdoorRoute';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

/** Quiet lines for a walk, run, or cycle. No banner. */
export function ActivityGoodToKnow({ kind }: { kind: 'setup' | 'live' }) {
  const theme = useAppTheme();
  return (
    <Card style={{ borderWidth: 1, borderColor: theme.colors.line }}>
      <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 15 * theme.scale, lineHeight: 20 * theme.scale, color: theme.colors.muted }}>
        Good to know
      </T>
      <T variant="muted">{OUTSIDE_SAFETY_LINE}</T>
      <T variant="muted">{OUTSIDE_CRISIS_LINE}</T>
      <T variant="muted">{ROUTE_SAFETY_LINE}</T>
      <T variant="muted">{TRAFFIC_LINE}</T>
      {kind === 'setup' ? <T variant="muted">{PATH_LINE}</T> : null}
      <T variant="muted">{ACTIVITY_LOCATION_LINE}</T>
      <T variant="muted">{BATTERY_NOTE}</T>
    </Card>
  );
}
