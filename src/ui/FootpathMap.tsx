import { useEffect, useState, type ComponentType } from 'react';
import { View } from 'react-native';

import {
  MAP_CREDIT,
  hereCollection,
  openFreeMapStyle,
  savedLineCollection,
  sketchLineCollection,
  toLngLat,
  viewCentre,
  type OutdoorPoint,
  type OutdoorRoute,
} from '@/domain/outdoorRoute';
import { radius, useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

type Maps = {
  Map: ComponentType<Record<string, unknown>>;
  Camera: ComponentType<Record<string, unknown>>;
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
 * The phone's own location engine is not started here.
 */
export function FootpathMap({
  routes,
  sketch,
  here,
  height = 280,
}: {
  routes: readonly OutdoorRoute[];
  sketch: readonly OutdoorPoint[];
  here: OutdoorPoint | null;
  height?: number;
}) {
  const theme = useAppTheme();
  const [maps, setMaps] = useState<Maps | null>(null);
  const centre = viewCentre(routes, sketch, here);
  const green = theme.scheme === 'dark' ? '#2DE0A0' : '#047857';

  useEffect(() => {
    setMaps(loadMaps());
  }, []);

  return (
    <View style={{ gap: 8 }}>
      {maps ? (
        <maps.Map
          mapStyle={openFreeMapStyle(theme.scheme)}
          attribution
          attributionPosition={{ bottom: 8, right: 8 }}
          style={{ height, borderRadius: radius.md, overflow: 'hidden' }}
        >
          <maps.Camera initialViewState={{ center: toLngLat(centre), zoom: here || sketch.length || routes.length ? 15 : 12 }} />
          <maps.GeoJSONSource id="saved" data={savedLineCollection(routes)} />
          <maps.Layer id="saved-line" type="line" source="saved" paint={{ 'line-color': green, 'line-width': 4 }} />
          <maps.GeoJSONSource id="sketch" data={sketchLineCollection(sketch)} />
          <maps.Layer
            id="sketch-line"
            type="line"
            source="sketch"
            paint={{ 'line-color': green, 'line-width': 3, 'line-dasharray': [2, 1.4] }}
          />
          <maps.GeoJSONSource id="here" data={hereCollection(here)} />
          <maps.Layer
            id="here-dot"
            type="circle"
            source="here"
            paint={{ 'circle-radius': 7, 'circle-color': green, 'circle-stroke-width': 2, 'circle-stroke-color': '#F3F3EE' }}
          />
        </maps.Map>
      ) : (
        <View style={{ height, borderRadius: radius.md, backgroundColor: theme.colors.sunken, justifyContent: 'center', padding: 16 }}>
          <T>The footpath map loads in the iPhone and Android app.</T>
        </View>
      )}
      <T variant="muted">{MAP_CREDIT}</T>
    </View>
  );
}
