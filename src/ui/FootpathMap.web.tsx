import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ORS_CREDIT, OSM_CONTRIBUTORS } from '@/domain/routeConsent';
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
  const host = useRef<View>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const centre = viewCentre(routes, sketch, here);
  const [east, north] = toLngLat(centre);
  const styleUrl = openFreeMapStyle(theme.scheme);
  const savedJson = JSON.stringify(savedLineCollection(routes));
  const sketchJson = JSON.stringify(sketchLineCollection(sketch));
  const hereJson = JSON.stringify(hereCollection(here));
  const zoom = here || sketch.length || routes.length ? 15 : 12;

  useEffect(() => {
    const node = host.current as unknown as HTMLElement | null;
    if (!node || typeof document === 'undefined') return;
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    void (async () => {
      try {
        if (!document.getElementById('maplibre-css')) {
          const link = document.createElement('link');
          link.id = 'maplibre-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/maplibre-gl@5.15.0/dist/maplibre-gl.css';
          document.head.appendChild(link);
        }
        const maplibre = await import('maplibre-gl');
        if (cancelled) return;
        const next = new maplibre.Map({
          container: node,
          style: styleUrl,
          center: [east, north],
          zoom,
          attributionControl: { compact: false },
        });
        map = next;
        next.on('load', () => {
          if (cancelled) return;
          const green = theme.scheme === 'dark' ? '#2DE0A0' : '#047857';
          next.addSource('saved', { type: 'geojson', data: JSON.parse(savedJson) });
          next.addLayer({
            id: 'saved-line',
            type: 'line',
            source: 'saved',
            paint: { 'line-color': green, 'line-width': 4 },
          });
          next.addSource('sketch', { type: 'geojson', data: JSON.parse(sketchJson) });
          next.addLayer({
            id: 'sketch-line',
            type: 'line',
            source: 'sketch',
            paint: { 'line-color': green, 'line-width': 3, 'line-dasharray': [2, 1.4] },
          });
          next.addSource('here', { type: 'geojson', data: JSON.parse(hereJson) });
          next.addLayer({
            id: 'here-dot',
            type: 'circle',
            source: 'here',
            paint: { 'circle-radius': 7, 'circle-color': green, 'circle-stroke-width': 2, 'circle-stroke-color': '#F3F3EE' },
          });
        });
      } catch {
        if (!cancelled) setProblem('The map tiles did not load in this browser.');
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [east, north, hereJson, savedJson, sketchJson, styleUrl, theme.scheme, zoom]);

  return (
    <View style={{ gap: 8 }}>
      <View
        ref={host}
        accessibilityLabel="Map with footpaths"
        style={{ height, width: '100%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: theme.colors.sunken }}
      />
      {problem ? <T variant="muted">{problem}</T> : null}
      <T variant="muted">{MAP_CREDIT}</T>
      <T variant="muted">{ORS_CREDIT}</T>
      <T variant="muted">{OSM_CONTRIBUTORS}</T>
    </View>
  );
}
