import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { viaPointCollection } from '@/domain/routeAdjust';
import { clampDrawZoom } from '@/domain/drawStroke';
import { DrawCapture, DrawZoomButtons } from '@/ui/DrawCapture';
import {
  YOU_HERE_FILL,
  YOU_HERE_RING,
  mapLineColour,
  openFreeMapStyle,
  pencilColour,
  pinCollection,
  savedLineCollection,
  sketchLineCollection,
  startCollection,
  trackLineCollection,
  trackLineColour,
  youAreHereCollection,
  type MapScheme,
  type OutdoorPoint,
  type OutdoorRoute,
} from '@/domain/outdoorRoute';
import { holdMapGestures, useHeldCamera, type HeldCamera } from '@/ui/mapCamera';
import { MapFrame } from '@/ui/MapChrome';
import { useFootpathStyle, useMapScheme } from '@/ui/mapStyle';
import { useScreenScroller } from '@/ui/ui';

type PaintInput = {
  scheme: MapScheme;
  savedJson: string;
  sketchJson: string;
  trackJson: string;
  startJson: string;
  youJson: string;
  guideJson: string;
  pinJson: string;
  viaJson: string;
  selectedJson: string;
};

type LibreMap = {
  remove: () => void;
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  jumpTo: (options: { center: [number, number]; zoom: number }) => void;
  resize: () => void;
  setStyle: (style: string | object) => void;
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
  onRecentre,
  follow,
  onUserMove,
  track = [],
  height = 280,
  adjust = null,
  bar = null,
  mapLabel,
  pencil = [],
  lookAt = null,
  lookFocus = 0,
  draw = null,
  pin = null,
  onToggleDraw,
  onUndoDraw,
  onClearDraw,
  canUndoDraw = false,
  canClearDraw = false,
}: {
  routes: readonly OutdoorRoute[];
  sketch: readonly OutdoorPoint[];
  here: OutdoorPoint | null;
  /** Green start when the route began on the nearest path, not at the GPS fix. */
  startPoint?: OutdoorPoint | null;
  /** Increments when the person asks the map to centre on the GPS fix. */
  locationFocus?: number;
  locating?: boolean;
  onShowMyLocation?: () => void;
  /** An outing uses this instead of Show my location. */
  onRecentre?: () => void;
  /** When set, the camera follows `here` until the person pans. */
  follow?: boolean;
  onUserMove?: () => void;
  /** Drawn for the outing. Not saved. */
  track?: readonly OutdoorPoint[];
  height?: number;
  adjust?: {
    enabled: boolean;
    vias: readonly OutdoorPoint[];
    selectedIndex: number | null;
    onTap: (point: OutdoorPoint) => void;
  } | null;
  /** Shown under the map while it is full screen. */
  bar?: ReactNode;
  /** Accessible name. Omitted maps keep "Map with footpaths". */
  mapLabel?: string;
  pencil?: readonly OutdoorPoint[];
  lookAt?: OutdoorPoint | null;
  lookFocus?: number;
  draw?: {
    enabled: boolean;
    onChange: (points: OutdoorPoint[]) => void;
    onEnd: (points: OutdoorPoint[]) => void;
  } | null;
  pin?: OutdoorPoint | null;
  onToggleDraw?: () => void;
  onUndoDraw?: () => void;
  onClearDraw?: () => void;
  canUndoDraw?: boolean;
  canClearDraw?: boolean;
}) {
  const [scheme, choose] = useMapScheme();
  const styleUrl = openFreeMapStyle(scheme);
  const mapStyle = useFootpathStyle(scheme, styleUrl);
  const scroller = useScreenScroller();
  const drawingOn = draw?.enabled === true;
  useEffect(() => {
    if (!drawingOn) return undefined;
    scroller?.current?.setScrollEnabled?.(false);
    return () => {
      scroller?.current?.setScrollEnabled?.(true);
    };
  }, [drawingOn, scroller]);
  const camera = useHeldCamera(routes, sketch, here, locationFocus, follow, track, lookAt, lookFocus);
  const applyView = useRef<(next: HeldCamera) => void>(() => {});
  function showDrawnView(next: { centre: OutdoorPoint; zoom: number }) {
    const place = {
      longitude: next.centre.longitude,
      latitude: next.centre.latitude,
      zoom: clampDrawZoom(next.zoom),
    };
    camera.remember(place);
    applyView.current(place);
  }
  function zoomBy(delta: number) {
    const current = camera.held.current;
    showDrawnView({
      centre: { latitude: current.latitude, longitude: current.longitude },
      zoom: current.zoom + delta,
    });
  }
  const [problem, setProblem] = useState<string | null>(null);
  const frame = useRef({ width: 0, height: 0 });
  const savedJson = JSON.stringify(savedLineCollection(routes));
  const sketchJson = JSON.stringify(sketchLineCollection(sketch));
  const guideJson = JSON.stringify(sketchLineCollection(pencil));
  const pinJson = JSON.stringify(pinCollection(pin));
  const viaJson = JSON.stringify(viaPointCollection(adjust?.vias ?? []));
  const selectedVia = adjust?.selectedIndex != null ? adjust.vias[adjust.selectedIndex] ?? null : null;
  const selectedJson = JSON.stringify(viaPointCollection(selectedVia ? [selectedVia] : []));
  const trackJson = JSON.stringify(trackLineCollection(track));
  const startJson = JSON.stringify(startCollection(routes, sketch, startPoint));
  const youJson = JSON.stringify(youAreHereCollection(here));

  return (
    <MapFrame
      here={here != null}
      height={height}
      scheme={scheme}
      locating={locating}
      onShowMyLocation={onShowMyLocation}
      onRecentre={onRecentre}
      onToggleStyle={() => choose(scheme === 'dark' ? 'light' : 'dark')}
      onRestore={camera.restore}
      problem={problem}
      bar={bar}
      mapLabel={mapLabel}
      drawing={drawingOn}
      onToggleDraw={onToggleDraw}
      onUndoDraw={onUndoDraw}
      onClearDraw={onClearDraw}
      canUndoDraw={canUndoDraw}
      canClearDraw={canClearDraw}
      renderMap={({ height: viewHeight }) => (
        <View
          style={{ height: viewHeight }}
          onLayout={(event) => {
            frame.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
          }}
        >
          <WebCanvas
            height={viewHeight}
            scheme={scheme}
            held={camera.held}
            frameTick={camera.frameTick}
            restoreTick={camera.restoreTick}
            remember={camera.remember}
            savedJson={savedJson}
            sketchJson={sketchJson}
            guideJson={guideJson}
            pinJson={pinJson}
            viaJson={viaJson}
            selectedJson={selectedJson}
            adjust={adjust}
            drawing={drawingOn}
            trackJson={trackJson}
            startJson={startJson}
            youJson={youJson}
            basemap={mapStyle}
            onUserMove={onUserMove}
            onProblem={() => setProblem('The map tiles did not load in this browser.')}
            applyView={applyView}
          />
          {draw?.enabled ? (
            <DrawCapture
              readView={() => ({
                centre: { latitude: camera.held.current.latitude, longitude: camera.held.current.longitude },
                zoom: camera.held.current.zoom,
                width: frame.current.width,
                height: frame.current.height || viewHeight,
              })}
              onChange={draw.onChange}
              onEnd={draw.onEnd}
              onView={showDrawnView}
            />
          ) : null}
          {draw?.enabled ? <DrawZoomButtons onZoom={zoomBy} /> : null}
        </View>
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
  const walked = trackLineColour(input.scheme);
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
        paint: { 'line-color': green, 'line-width': 6 },
      },
    },
    {
      id: 'guide',
      data: input.guideJson,
      layer: {
        id: 'guide-line',
        type: 'line',
        source: 'guide',
        paint: { 'line-color': pencilColour(input.scheme), 'line-width': 7 },
      },
    },
    {
      id: 'vias',
      data: input.viaJson,
      layer: {
        id: 'via-dot',
        type: 'circle',
        source: 'vias',
        paint: { 'circle-radius': 12, 'circle-color': '#0C0C0C', 'circle-stroke-width': 3, 'circle-stroke-color': '#D1FAE5' },
      },
    },
    {
      id: 'via-selected',
      data: input.selectedJson,
      layer: {
        id: 'via-selected-ring',
        type: 'circle',
        source: 'via-selected',
        paint: { 'circle-radius': 16, 'circle-color': 'transparent', 'circle-stroke-width': 3, 'circle-stroke-color': '#F3F3EE' },
      },
    },
    {
      id: 'track',
      data: input.trackJson,
      layer: { id: 'track-line', type: 'line', source: 'track', paint: { 'line-color': walked, 'line-width': 5 } },
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
      id: 'pin',
      data: input.pinJson,
      layer: {
        id: 'pin-dot',
        type: 'circle',
        source: 'pin',
        paint: { 'circle-radius': 8, 'circle-color': pencilColour(input.scheme), 'circle-stroke-width': 3, 'circle-stroke-color': '#F3F3EE' },
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
  guideJson,
  pinJson,
  viaJson,
  selectedJson,
  adjust,
  drawing = false,
  trackJson,
  startJson,
  youJson,
  basemap,
  onUserMove,
  onProblem,
  applyView,
}: {
  height: number;
  scheme: MapScheme;
  held: { current: HeldCamera };
  frameTick: number;
  restoreTick: number;
  remember: (camera: HeldCamera) => void;
  savedJson: string;
  sketchJson: string;
  guideJson: string;
  pinJson: string;
  viaJson: string;
  selectedJson: string;
  adjust: {
    enabled: boolean;
    vias: readonly OutdoorPoint[];
    selectedIndex: number | null;
    onTap: (point: OutdoorPoint) => void;
  } | null;
  drawing?: boolean;
  trackJson: string;
  startJson: string;
  youJson: string;
  basemap: string | object;
  onUserMove?: () => void;
  onProblem: () => void;
  applyView: { current: (next: HeldCamera) => void };
}) {
  const host = useRef<View>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const [ready, setReady] = useState(0);
  const applied = useRef<string | null>(null);
  const styleListener = useRef<(() => void) | null>(null);
  const paint = useRef<PaintInput>({ scheme, savedJson, sketchJson, trackJson, startJson, youJson, guideJson, pinJson, viaJson, selectedJson });
  paint.current = { scheme, savedJson, sketchJson, trackJson, startJson, youJson, guideJson, pinJson, viaJson, selectedJson };
  const adjustRef = useRef(adjust);
  adjustRef.current = adjust;
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const userMoveRef = useRef(onUserMove);
  userMoveRef.current = onUserMove;
  const heldRef = useRef(held);
  heldRef.current = held;
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  const problemRef = useRef(onProblem);
  problemRef.current = onProblem;
  const applyViewRef = useRef(applyView);
  applyViewRef.current = applyView;
  const basemapRef = useRef(basemap);
  basemapRef.current = basemap;
  const basemapKey = typeof basemap === 'string' ? basemap : `json:${scheme}`;

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
        const initial = basemapRef.current;
        const next = new maplibre.Map({
          container: node,
          style: initial as string,
          center: [start.longitude, start.latitude],
          zoom: start.zoom,
          attributionControl: false,
        });
        map = next as unknown as LibreMap;
        mapRef.current = map;
        applied.current = typeof initial === 'string' ? initial : `json:${paint.current.scheme}`;
        map.on('moveend', (event?: { originalEvent?: unknown }) => {
          if (!event?.originalEvent) return;
          const current = mapRef.current;
          if (!current) return;
          const center = current.getCenter();
          rememberRef.current({ longitude: center.lng, latitude: center.lat, zoom: current.getZoom() });
          userMoveRef.current?.();
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
    if (applied.current !== basemapKey) {
      applied.current = basemapKey;
      const place = held.current;
      if (styleListener.current) map.off('styledata', styleListener.current);
      const finish = () => {
        const current = mapRef.current;
        if (!current || !current.isStyleLoaded()) return;
        if (current.getLayer('sketch-line') && current.getLayer('saved-line') && current.getLayer('track-line')) return;
        current.jumpTo({ center: [place.longitude, place.latitude], zoom: place.zoom });
        paintMap(current, paint.current);
      };
      styleListener.current = finish;
      map.on('styledata', finish);
      map.setStyle(basemap);
      map.once('idle', finish);
      return;
    }
    paintMap(map, paint.current);
  }, [scheme, basemap, basemapKey, savedJson, sketchJson, guideJson, pinJson, viaJson, selectedJson, trackJson, startJson, youJson, ready, held]);

  useEffect(() => {
    holdMapGestures(mapRef.current, drawing);
    const sink = applyViewRef.current;
    sink.current = (next) => {
      rememberRef.current(next);
      mapRef.current?.jumpTo({ center: [next.longitude, next.latitude], zoom: next.zoom });
    };
    return () => {
      sink.current = () => {};
    };
  }, [drawing, ready]);

  useEffect(() => {
    const map = mapRef.current as (LibreMap & {
      on: (event: string, listener: (event: { lngLat?: { lng: number; lat: number } }) => void) => void;
      off: (event: string, listener: (event: { lngLat?: { lng: number; lat: number } }) => void) => void;
    }) | null;
    if (!map || !ready) return;
    const pointOf = (event: { lngLat?: { lng: number; lat: number } }): OutdoorPoint | null => {
      if (!event.lngLat || !Number.isFinite(event.lngLat.lat) || !Number.isFinite(event.lngLat.lng)) return null;
      return { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
    };
    const tap = (event: { lngLat?: { lng: number; lat: number } }) => {
      if (drawingRef.current) return;
      const current = adjustRef.current;
      const point = pointOf(event);
      if (!current?.enabled || !point) return;
      current.onTap(point);
    };
    map.on('click', tap);
    return () => {
      map.off('click', tap);
    };
  }, [ready]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [height, ready]);

  return <View ref={host} style={{ height, width: '100%', position: 'relative', overflow: 'hidden' }} />;
}
