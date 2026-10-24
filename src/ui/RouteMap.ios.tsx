import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  ROUTE_MAP_TIMEOUT,
  ROUTE_MAP_TIMEOUT_MS,
  ROUTE_READING,
  downsampleRoute,
  routeErrorLine,
  routeMapRegion,
  type RoutePoint,
} from '@/domain/workoutRoute';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

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
  try {
    const loaded = require('react-native-maps') as AppleMaps;
    if (!loaded?.default || !loaded.Polyline) throw new Error('Apple Maps did not load.');
    return loaded;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Apple Maps did not load.');
  }
}

function coordinates(points: readonly RoutePoint[]): LatLng[] {
  return downsampleRoute(points).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
}

/**
 * Apple Maps, the default provider. The module is loaded after the screen is
 * up, so a missing native map is a fallback on this screen. The path is not
 * uploaded, and the user location is not shown.
 */
export function RouteMap({
  points,
  active,
  onProblem,
}: {
  points: readonly RoutePoint[];
  active: readonly RoutePoint[];
  onProblem?: (line: string) => void;
}) {
  const theme = useAppTheme();
  const [maps, setMaps] = useState<AppleMaps | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [stopped, setStopped] = useState(false);
  const reported = useRef(false);
  const onProblemRef = useRef(onProblem);
  onProblemRef.current = onProblem;
  const drawn = downsampleRoute(points);
  const region = routeMapRegion(drawn);
  const line = coordinates(drawn);
  const highlight = coordinates(active);

  function fail(error: unknown) {
    if (reported.current) return;
    reported.current = true;
    setStopped(true);
    onProblemRef.current?.(routeErrorLine(error));
  }

  const canDraw = Boolean(region && line.length >= 2);

  useEffect(() => {
    if (!canDraw || stopped) return;
    try {
      setMaps(loadAppleMaps());
    } catch (error) {
      fail(error);
    }
  }, [canDraw, stopped]);

  useEffect(() => {
    if (!maps || mapReady || stopped) return;
    const timer = setTimeout(() => fail(ROUTE_MAP_TIMEOUT), ROUTE_MAP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [maps, mapReady, stopped]);

  if (!region || line.length < 2) return null;
  if (stopped) return null;
  if (!maps) {
    return (
      <View accessibilityLabel="Workout route" style={{ minHeight: 44, justifyContent: 'center' }}>
        <T variant="muted">{ROUTE_READING}</T>
      </View>
    );
  }
  const MapView = maps.default;
  const { Polyline } = maps;
  return (
    <View style={{ gap: 8 }}>
      {mapReady ? null : <T variant="muted">{ROUTE_READING}</T>}
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
    </View>
  );
}
