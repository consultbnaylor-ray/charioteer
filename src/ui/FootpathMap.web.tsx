import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  YOU_HERE_FILL,
  YOU_HERE_RING,
  mapLineColour,
  openFreeMapStyle,
  savedLineCollection,
  sketchLineCollection,
  startCollection,
  youAreHereCollection,
  type MapScheme,
  type OutdoorPoint,
  type OutdoorRoute,
} from '@/domain/outdoorRoute';
import { useHeldCamera, type HeldCamera } from '@/ui/mapCamera';
import { MapFrame } from '@/ui/MapChrome';
import { useMapScheme } from '@/ui/mapStyle';

type PaintInput = {
  scheme: MapScheme;
  savedJson: string;
  sketchJson: string;
  startJson: string;
  youJson: string;
};

type LibreMap = {
  remove: () => void;
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  jumpTo: (options: { center: [number, number]; zoom: number }) => void;
  resize: () => void;
  setStyle: (url: string) => void;
  isStyleLoaded: () => boolean;
  getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
  getLayer: (id: string) => unknown;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  setPaintProperty: (layer: string, name: string, value: unknown) => void;
  on: (event: string, listener: () => void) => void;
  once: (event: string, listener: () => void) => void;
  off: (event: string, listener: () => void) => void;
};

/**
 * OpenFreeMap tiles in MapLibre. The light Liberty style is the default, independent of the app theme.
 * The phone's own location engine is not started here. The blue dot is a point the person asked to see.
 */
export function FootpathMap({
  routes,
  sketch,
  here,
  startPoint = null,
  locationFocus = 0,
  locating = false,
  onShowMyLocation,
  height = 280,
}: {
  routes: readonly OutdoorRoute[];
  sketch: readonly OutdoorPoint[];
  here: OutdoorPoint | null;
  /** Green start when the route began on the nearest path, not at the GPS fix. */
  startPoint?: OutdoorPoint | null;
  /** Increments when the person asks the map to centre on the GPS fix. */
  locationFocus?: number;
  locating?: boolean;
  onShowMyLocation: () => void;
  height?: number;
}) {
  const [scheme, choose] = useMapScheme();
  const camera = useHeldCamera(routes, sketch, here, locationFocus);
  const [problem, setProblem] = useState<string | null>(null);
  const savedJson = JSON.stringify(savedLineCollection(routes));
  const sketchJson = JSON.stringify(sketchLineCollection(sketch));
  const startJson = JSON.stringify(startCollection(routes, sketch, startPoint));
  const youJson = JSON.stringify(youAreHereCollection(here));

  return (
    <MapFrame
      here={here != null}
      height={height}
      scheme={scheme}
      locating={locating}
      onShowMyLocation={onShowMyLocation}
      onToggleStyle={() => choose(scheme === 'dark' ? 'light' : 'dark')}
      onRestore={camera.restore}
      problem={problem}
      renderMap={({ height: viewHeight }) => (
        <WebCanvas
          height={viewHeight}
          scheme={scheme}
          held={camera.held}
          frameTick={camera.frameTick}
          restoreTick={camera.restoreTick}
          remember={camera.remember}
          savedJson={savedJson}
          sketchJson={sketchJson}
          startJson={startJson}
          youJson={youJson}
          onProblem={() => setProblem('The map tiles did not load in this browser.')}
        />
      )}
    />
  );
}

function paintMap(map: LibreMap, input: PaintInput) {
  try {
    if (!map.isStyleLoaded()) return;
    paintMapLayers(map, input);
  } catch {
    // The style is still swapping. The next styledata event paints again.
  }
}

function paintMapLayers(map: LibreMap, input: PaintInput) {
  const green = mapLineColour(input.scheme);
  const rows: { id: string; data: string; layer: Record<string, unknown> }[] = [
    {
      id: 'saved',
      data: input.savedJson,
      layer: { id: 'saved-line', type: 'line', source: 'saved', paint: { 'line-color': green, 'line-width': 4 } },
    },
    {
      id: 'sketch',
      data: input.sketchJson,
      layer: {
        id: 'sketch-line',
        type: 'line',
        source: 'sketch',
        paint: { 'line-color': green, 'line-width': 3, 'line-dasharray': [2, 1.4] },
      },
    },
    {
      id: 'start',
      data: input.startJson,
      layer: {
        id: 'start-dot',
        type: 'circle',
        source: 'start',
        paint: { 'circle-radius': 6, 'circle-color': green, 'circle-stroke-width': 2, 'circle-stroke-color': '#F3F3EE' },
      },
    },
    {
      id: 'you',
      data: input.youJson,
      layer: {
        id: 'you-dot',
        type: 'circle',
        source: 'you',
        paint: { 'circle-radius': 8, 'circle-color': YOU_HERE_FILL, 'circle-stroke-width': 3, 'circle-stroke-color': YOU_HERE_RING },
      },
    },
  ];
  for (const row of rows) {
    const data = JSON.parse(row.data) as unknown;
    const source = map.getSource(row.id);
    if (source) source.setData(data);
    else map.addSource(row.id, { type: 'geojson', data });
    if (map.getLayer(String(row.layer.id))) {
      const paint = row.layer.paint as Record<string, unknown>;
      for (const [name, value] of Object.entries(paint)) map.setPaintProperty(String(row.layer.id), name, value);
    } else {
      map.addLayer(row.layer);
    }
  }
}

function WebCanvas({
  height,
  scheme,
  held,
  frameTick,
  restoreTick,
  remember,
  savedJson,
  sketchJson,
  startJson,
  youJson,
  onProblem,
}: {
  height: number;
  scheme: MapScheme;
  held: { current: HeldCamera };
  frameTick: number;
  restoreTick: number;
  remember: (camera: HeldCamera) => void;
  savedJson: string;
  sketchJson: string;
  startJson: string;
  youJson: string;
  onProblem: () => void;
}) {
  const host = useRef<View>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const [ready, setReady] = useState(0);
  const applied = useRef<string | null>(null);
  const styleListener = useRef<(() => void) | null>(null);
  const paint = useRef<PaintInput>({ scheme, savedJson, sketchJson, startJson, youJson });
  paint.current = { scheme, savedJson, sketchJson, startJson, youJson };
  const heldRef = useRef(held);
  heldRef.current = held;
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  const problemRef = useRef(onProblem);
  problemRef.current = onProblem;

  useEffect(() => {
    const node = host.current as unknown as HTMLElement | null;
    if (!node || typeof document === 'undefined') return;
    let map: LibreMap | null = null;
    let cancelled = false;
    void (async () => {
      try {
        if (!document.getElementById('maplibre-attrib-room')) {
          const room = document.createElement('style');
          room.id = 'maplibre-attrib-room';
          room.textContent = '.maplibregl-ctrl-attrib{max-width:calc(100% - 56px)}';
          document.head.appendChild(room);
        }
        if (!document.getElementById('maplibre-css')) {
          const link = document.createElement('link');
          link.id = 'maplibre-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/maplibre-gl@5.15.0/dist/maplibre-gl.css';
          document.head.appendChild(link);
        }
        const maplibre = await import('maplibre-gl');
        if (cancelled) return;
        const start = heldRef.current.current;
        const url = openFreeMapStyle(paint.current.scheme);
        const next = new maplibre.Map({
          container: node,
          style: url,
          center: [start.longitude, start.latitude],
          zoom: start.zoom,
          attributionControl: { compact: false },
        });
        map = next as unknown as LibreMap;
        mapRef.current = map;
        applied.current = url;
        map.on('moveend', (event?: { originalEvent?: unknown }) => {
          if (!event?.originalEvent) return;
          const current = mapRef.current;
          if (!current) return;
          const center = current.getCenter();
          rememberRef.current({ longitude: center.lng, latitude: center.lat, zoom: current.getZoom() });
        });
        map.on('load', () => {
          const current = mapRef.current;
          if (current) paintMap(current, paint.current);
        });
        setReady((value) => value + 1);
      } catch {
        if (!cancelled) problemRef.current();
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      applied.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = held.current;
    const center = map.getCenter();
    const same = Math.abs(center.lng - next.longitude) < 1e-5
      && Math.abs(center.lat - next.latitude) < 1e-5
      && Math.abs(map.getZoom() - next.zoom) < 0.02;
    if (same) return;
    map.jumpTo({ center: [next.longitude, next.latitude], zoom: next.zoom });
  }, [held, frameTick, restoreTick, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const url = openFreeMapStyle(scheme);
    if (applied.current !== url) {
      applied.current = url;
      const place = held.current;
      if (styleListener.current) map.off('styledata', styleListener.current);
      const finish = () => {
        const current = mapRef.current;
        if (!current || !current.isStyleLoaded()) return;
        if (current.getLayer('sketch-line') && current.getLayer('saved-line')) return;
        current.jumpTo({ center: [place.longitude, place.latitude], zoom: place.zoom });
        paintMap(current, paint.current);
      };
      styleListener.current = finish;
      map.on('styledata', finish);
      map.setStyle(url);
      map.once('idle', finish);
      return;
    }
    paintMap(map, paint.current);
  }, [scheme, savedJson, sketchJson, startJson, youJson, ready, held]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [height, ready]);

  return <View ref={host} style={{ height, width: '100%' }} />;
}
