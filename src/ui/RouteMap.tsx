import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import type { RoutePoint } from '@/domain/workoutRoute';
import { useAppTheme } from '@/ui/theme';

/** A monochrome path for the browser. The iPhone uses Apple Maps. */
export function RouteMap({ points, active }: { points: readonly RoutePoint[]; active: readonly RoutePoint[] }) {
  const theme = useAppTheme();
  if (points.length < 2) return null;
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.0008);
  const lngSpan = Math.max(maxLng - minLng, 0.0008);
  const project = (point: RoutePoint) => {
    const x = ((point.longitude - minLng) / lngSpan) * 280 + 20;
    const y = (1 - (point.latitude - minLat) / latSpan) * 180 + 16;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const line = points.map(project).join(' ');
  const highlight = active.length > 1 ? active.map(project).join(' ') : '';
  return (
    <View accessibilityLabel="Workout route" style={{ height: 220, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surface }}>
      <Svg width="100%" height="100%" viewBox="0 0 320 212">
        <Polyline points={line} fill="none" stroke={theme.colors.muted} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {highlight ? <Polyline points={highlight} fill="none" stroke={theme.colors.ink} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" /> : null}
      </Svg>
    </View>
  );
}
