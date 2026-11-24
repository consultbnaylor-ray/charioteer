import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { elevationProfileSamples, routeElevations, routeSnapLines, type RoutePlan } from '@/domain/findRoute';
import { DRAW_TICK_GREEN } from '@/domain/routeAdjust';
import { T } from '@/ui/ui';

/** Distance, time, and climb for a snapped line. Descent, gradient, and a profile appear only when the response had them. */
export function RouteSnapSummary({ plan }: { plan: RoutePlan }) {
  const lines = routeSnapLines(plan);
  const elevations = routeElevations(plan);
  return (
    <View
      accessibilityLabel="Snapped route summary"
      style={{ gap: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: DRAW_TICK_GREEN }}
    >
      {lines.map((line, index) => (
        <T key={`${index}:${line}`}>{line}</T>
      ))}
      {elevations ? <ElevationProfile metres={elevations} /> : null}
    </View>
  );
}

function ElevationProfile({ metres }: { metres: readonly number[] }) {
  const samples = elevationProfileSamples(metres);
  if (samples.length < 2) return null;
  const width = 280;
  const height = 48;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = max - min || 1;
  const points = samples.map((value, index) => {
    const x = (index / (samples.length - 1)) * (width - 4) + 2;
    const y = height - 4 - ((value - min) / span) * (height - 8);
    return `${x},${y}`;
  }).join(' ');
  return (
    <View accessibilityLabel="Elevation profile">
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline points={points} fill="none" stroke={DRAW_TICK_GREEN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
