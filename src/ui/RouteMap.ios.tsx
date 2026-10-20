import { View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';

import type { RoutePoint } from '@/domain/workoutRoute';
import { useAppTheme } from '@/ui/theme';

function regionFor(points: readonly RoutePoint[]) {
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.4),
  };
}

function coordinates(points: readonly RoutePoint[]) {
  return points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
}

/** Apple Maps. The user location is not shown, and the path is not uploaded. */
export function RouteMap({ points, active }: { points: readonly RoutePoint[]; active: readonly RoutePoint[] }) {
  const theme = useAppTheme();
  if (points.length < 2) return null;
  return (
    <View accessibilityLabel="Workout route" style={{ height: 280, borderWidth: 1, borderColor: theme.colors.line, overflow: 'hidden' }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={regionFor(points)}
        mapType="mutedStandard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass
        rotateEnabled={false}
      >
        <Polyline coordinates={coordinates(points)} strokeColor={theme.colors.muted} strokeWidth={4} />
        {active.length > 1 ? <Polyline coordinates={coordinates(active)} strokeColor={theme.colors.ink} strokeWidth={6} /> : null}
      </MapView>
    </View>
  );
}
