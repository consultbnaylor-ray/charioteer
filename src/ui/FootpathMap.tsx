import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { View } from 'react-native';

import { ORS_CREDIT, OSM_CONTRIBUTORS } from '@/domain/routeConsent';
import {
  MAP_CREDIT,
  YOU_HERE_FILL,
  YOU_HERE_RING,
  openFreeMapStyle,
  savedLineCollection,
  sketchLineCollection,
  startCollection,
  toLngLat,
  viewCentre,
  youAreHereCollection,
  type OutdoorPoint,
  type OutdoorRoute,
} from '@/domain/outdoorRoute';
import { ShowMyLocationButton } from '@/ui/ShowMyLocation';
import { radius, useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

type CameraHandle = {
  flyTo: (options: { center: [number, number]; zoom?: number; duration?: number }) => void;
};

type Maps = {
  Map: ComponentType<Record<string, unknown>>;
  Camera: ComponentType<{ ref?: Ref<CameraHandle> } & Record<string, unknown>>;
  GeoJSONSource: ComponentType<Record<string, unknown>>;
  Layer: ComponentType<Record<string, unknown>>;
};

function loadMaps(): Maps | null {
  try {
    const loaded = require('@maplibre/maplibre-react-native') as Maps;
    if (!loaded.Map || !loaded.Camera || !loaded.GeoJSONSource || !loaded.Layer) return null;
    return loaded;
  } catch {
    return null;
  }
}

/**
 * OpenFreeMap tiles in MapLibre. Attribution stays on.
 * The phone's own location engine is not started here. The blue dot is a point the person asked to see.
 */
export function FootpathMap({
  routes,
  sketch,
  here,
  locationFocus = 0,
  locating = false,
  onShowMyLocation,
  height = 280,
}: {
  routes: readonly OutdoorRoute[];
  sketch: readonly OutdoorPoint[];
  here: OutdoorPoint | null;
  /** Increments when the person asks the map to centre on the GPS fix. */
  locationFocus?: number;
  locating?: boolean;
  onShowMyLocation: () => void;
  height?: number;
}) {
  const theme = useAppTheme();
  const camera = useRef<CameraHandle>(null);
  const [maps, setMaps] = useState<Maps | null>(null);
  const framed = viewCentre(routes, sketch, here);
  const centre = locationFocus > 0 && here ? here : framed;
  const [lng, lat] = toLngLat(centre);
  const zoom = locationFocus > 0 || sketch.length || routes.length || here ? 15 : 12;
  const green = theme.scheme === 'dark' ? '#2DE0A0' : '#047857';
  const opened = useRef(false);

  useEffect(() => {
    setMaps(loadMaps());
  }, []);

  useEffect(() => {
    if (!maps) return;
    if (!opened.current) {
      opened.current = true;
      return;
    }
    camera.current?.flyTo({ center: [lng, lat], zoom, duration: 700 });
  }, [maps, lng, lat, zoom, locationFocus]);

  return (
    <View style={{ gap: 8 }}>
      {maps ? (
        <View
          accessibilityLabel={here ? 'Map with footpaths. You are here.' : 'Map with footpaths'}
          style={{ height, borderRadius: radius.md, overflow: 'hidden', position: 'relative' }}
        >
          <maps.Map
            mapStyle={openFreeMapStyle(theme.scheme)}
            attribution
            attributionPosition={{ bottom: 8, right: 8 }}
            style={{ height, borderRadius: radius.md, overflow: 'hidden' }}
          >
            <maps.Camera ref={camera} initialViewState={{ center: [lng, lat], zoom }} />
            <maps.GeoJSONSource id="saved" data={savedLineCollection(routes)} />
            <maps.Layer id="saved-line" type="line" source="saved" paint={{ 'line-color': green, 'line-width': 4 }} />
            <maps.GeoJSONSource id="sketch" data={sketchLineCollection(sketch)} />
            <maps.Layer
              id="sketch-line"
              type="line"
              source="sketch"
              paint={{ 'line-color': green, 'line-width': 3, 'line-dasharray': [2, 1.4] }}
            />
            <maps.GeoJSONSource id="start" data={startCollection(routes, sketch)} />
            <maps.Layer
              id="start-dot"
              type="circle"
              source="start"
              paint={{ 'circle-radius': 6, 'circle-color': green, 'circle-stroke-width': 2, 'circle-stroke-color': '#F3F3EE' }}
            />
            <maps.GeoJSONSource id="you" data={youAreHereCollection(here)} />
            <maps.Layer
              id="you-dot"
              type="circle"
              source="you"
              paint={{ 'circle-radius': 8, 'circle-color': YOU_HERE_FILL, 'circle-stroke-width': 3, 'circle-stroke-color': YOU_HERE_RING }}
            />
          </maps.Map>
          <ShowMyLocationButton pending={locating} onPress={onShowMyLocation} />
        </View>
      ) : (
        <View style={{ height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: theme.colors.sunken, justifyContent: 'center', padding: 16 }}>
          <T>The footpath map loads in the iPhone and Android app.</T>
          <ShowMyLocationButton pending={locating} onPress={onShowMyLocation} />
        </View>
      )}
      <T variant="muted">{MAP_CREDIT}</T>
      <T variant="muted">{ORS_CREDIT}</T>
      <T variant="muted">{OSM_CONTRIBUTORS}</T>
    </View>
  );
}
