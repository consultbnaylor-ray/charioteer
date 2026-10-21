import { useState, type ComponentType, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  downsampleRoute,
  routeMapRegion,
  type RoutePoint,
} from '@/domain/workoutRoute';
import { useAppTheme } from '@/ui/theme';

type LatLng = { latitude: number; longitude: number };

type AppleMaps = {
  default: ComponentType<{
    style?: object;
    initialRegion: NonNullable<ReturnType<typeof routeMapRegion>>;
    mapType?: string;
    showsUserLocation?: boolean;
    showsMyLocationButton?: boolean;
    showsCompass?: boolean;
    rotateEnabled?: boolean;
    onMapReady?: () => void;
    children?: ReactNode;
  }>;
  Polyline: ComponentType<{
    coordinates: LatLng[];
    strokeColor?: string;
    strokeWidth?: number;
  }>;
};

function loadAppleMaps(): AppleMaps {
  return require('react-native-maps') as AppleMaps;
}

function coordinates(points: readonly RoutePoint[]): LatLng[] {
  return downsampleRoute(points).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
}

/**
 * Apple Maps, the default provider. The module is loaded while drawing so a
 * missing native map becomes a screen error instead of failing the navigation.
 * The path is not uploaded, and the user location is not shown.
 */
export function RouteMap({ points, active }: { points: readonly RoutePoint[]; active: readonly RoutePoint[] }) {
  const theme = useAppTheme();
  const [mapReady, setMapReady] = useState(false);
  const drawn = downsampleRoute(points);
  const region = routeMapRegion(drawn);
  const line = coordinates(drawn);
  const highlight = coordinates(active);
  if (!region || line.length < 2) return null;
  const maps = loadAppleMaps();
  const MapView = maps.default;
  const { Polyline } = maps;
  return (
    <View accessibilityLabel="Workout route" style={{ height: 280, borderWidth: 1, borderColor: theme.colors.line, overflow: 'hidden' }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={region}
        mapType="mutedStandard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass
        rotateEnabled={false}
        onMapReady={() => setMapReady(true)}
      >
        {mapReady ? <Polyline coordinates={line} strokeColor={theme.colors.muted} strokeWidth={4} /> : null}
        {mapReady && highlight.length > 1 ? <Polyline coordinates={highlight} strokeColor={theme.colors.ink} strokeWidth={6} /> : null}
      </MapView>
    </View>
  );
}
