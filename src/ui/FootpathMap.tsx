import { useEffect, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';

import { mapPressPoint, viaPointCollection } from '@/domain/routeAdjust';
import { clampDrawZoom } from '@/domain/drawStroke';
import { DrawCapture, DrawZoomButtons } from '@/ui/DrawCapture';
import {
  YOU_HERE_FILL,
  YOU_HERE_RING,
  mapLineColour,
  pencilColour,
  pinCollection,
  openFreeMapStyle,
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
import { flyWhenReady, jumpWhenReady, pageScrollForMapTouch, useHeldCamera, type HeldCamera } from '@/ui/mapCamera';
import { MapFrame } from '@/ui/MapChrome';
import { useFootpathStyle, useMapScheme } from '@/ui/mapStyle';
import { T, useScreenScroller } from '@/ui/ui';

type CameraHandle = {
  flyTo: (options: { center: [number, number]; zoom?: number; duration?: number }) => void;
};

type RegionEvent = {
  nativeEvent?: { center?: [number, number]; zoom?: number; userInteraction?: boolean };
};

type MapAdjust = {
  enabled: boolean;
  vias: readonly OutdoorPoint[];
  selectedIndex: number | null;
  onTap: (point: OutdoorPoint) => void;
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
 * OpenFreeMap tiles in MapLibre. The light Liberty style is the default.
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
  onConfirmDraw,
  canUndoDraw = false,
  canClearDraw = false,
  canConfirmDraw = false,
  confirmPending = false,
  statusNote = null,
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
  adjust?: MapAdjust | null;
  /** Shown under the map while it is full screen. */
  bar?: ReactNode;
  /** Accessible name. Omitted maps keep "Map with footpaths". */
  mapLabel?: string;
  /** The finger sketch, shown dashed until a snapped route replaces it. */
  pencil?: readonly OutdoorPoint[];
  /** A searched place. `lookFocus` increments when the map should move there. */
  lookAt?: OutdoorPoint | null;
  lookFocus?: number;
  draw?: {
    enabled: boolean;
    onChange: (points: OutdoorPoint[]) => void;
    onEnd: (points: OutdoorPoint[]) => void;
  } | null;
  /** A searched place. The map draws a pin. The camera moves only when `lookFocus` changes. */
  pin?: OutdoorPoint | null;
  onToggleDraw?: () => void;
  onUndoDraw?: () => void;
  onClearDraw?: () => void;
  onConfirmDraw?: () => void;
  canUndoDraw?: boolean;
  canClearDraw?: boolean;
  canConfirmDraw?: boolean;
  confirmPending?: boolean;
  /** Shown on the map after drawing finishes. A snap uses the green chip. */
  statusNote?: string | null;
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
  const [maps, setMaps] = useState<Maps | null>(null);
  useEffect(() => {
    setMaps(loadMaps());
  }, []);

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
      bar={bar}
      mapLabel={mapLabel}
      drawing={drawingOn}
      onToggleDraw={onToggleDraw}
      onUndoDraw={onUndoDraw}
      onClearDraw={onClearDraw}
      onConfirmDraw={onConfirmDraw}
      canUndoDraw={canUndoDraw}
      canClearDraw={canClearDraw}
      canConfirmDraw={canConfirmDraw}
      confirmPending={confirmPending}
      statusNote={statusNote}
      renderMap={({ height: viewHeight, expanded }) => (
        <NativeCanvas
          maps={maps}
          height={viewHeight}
          scheme={scheme}
          held={camera.held}
          frameTick={camera.frameTick}
          restoreTick={camera.restoreTick}
          remember={camera.remember}
          routes={routes}
          sketch={sketch}
          here={here}
          startPoint={startPoint}
          track={track}
          onUserMove={onUserMove}
          adjust={adjust}
          expanded={expanded}
          pencil={pencil}
          pin={pin}
          draw={draw}
          mapStyle={mapStyle}
        />
      )}
    />
  );
}

function NativeCanvas({
  maps,
  height,
  scheme,
  held,
  frameTick,
  restoreTick,
  remember,
  routes,
  sketch,
  here,
  startPoint,
  track,
  onUserMove,
  adjust,
  expanded,
  pencil,
  pin,
  draw,
  mapStyle,
}: {
  maps: Maps | null;
  height: number;
  scheme: MapScheme;
  held: { current: HeldCamera };
  frameTick: number;
  restoreTick: number;
  remember: (camera: HeldCamera) => void;
  routes: readonly OutdoorRoute[];
  sketch: readonly OutdoorPoint[];
  here: OutdoorPoint | null;
  startPoint: OutdoorPoint | null;
  track: readonly OutdoorPoint[];
  onUserMove?: () => void;
  adjust: MapAdjust | null;
  expanded: boolean;
  pencil: readonly OutdoorPoint[];
  pin: OutdoorPoint | null;
  draw: {
    enabled: boolean;
    onChange: (points: OutdoorPoint[]) => void;
    onEnd: (points: OutdoorPoint[]) => void;
  } | null;
  mapStyle: string | object;
}) {
  const camera = useRef<CameraHandle>(null);
  const size = useRef({ width: 0, height });
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const moved = useRef(onUserMove);
  moved.current = onUserMove;
  const scroller = useScreenScroller();
  const green = mapLineColour(scheme);
  const walked = trackLineColour(scheme);
  const place = held.current;

  const holdPage = (fingerDown: boolean) => {
    if (drawRef.current?.enabled) {
      scroller?.current?.setScrollEnabled?.(false);
      return;
    }
    const scrolling = pageScrollForMapTouch(expanded, fingerDown);
    if (scrolling == null) return;
    scroller?.current?.setScrollEnabled?.(scrolling);
  };

  useEffect(() => {
    const place = held.current;
    if (flyWhenReady(camera.current, place)) return undefined;
    const retry = requestAnimationFrame(() => {
      flyWhenReady(camera.current, held.current);
    });
    return () => cancelAnimationFrame(retry);
  }, [held, frameTick, restoreTick]);

  useEffect(() => {
    return () => {
      if (drawRef.current?.enabled) {
        scroller?.current?.setScrollEnabled?.(false);
        return;
      }
      scroller?.current?.setScrollEnabled?.(true);
    };
  }, [scroller]);

  if (!maps) {
    return (
      <View style={{ height, justifyContent: 'center', padding: 16 }}>
        <T>The footpath map loads in the iPhone and Android app.</T>
      </View>
    );
  }
  const selected = adjust?.selectedIndex != null ? adjust.vias[adjust.selectedIndex] ?? null : null;
  const drawing = draw?.enabled === true;

  function showDrawnView(next: { centre: OutdoorPoint; zoom: number }) {
    const place = {
      longitude: next.centre.longitude,
      latitude: next.centre.latitude,
      zoom: clampDrawZoom(next.zoom),
    };
    remember(place);
    jumpWhenReady(camera.current, place);
  }

  function zoomBy(delta: number) {
    const current = held.current;
    showDrawnView({
      centre: { latitude: current.latitude, longitude: current.longitude },
      zoom: current.zoom + delta,
    });
  }

  return (
    <View
      style={{ height }}
      onLayout={(event) => {
        size.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
      }}
    >
    <maps.Map
      mapStyle={mapStyle}
      attribution={false}
      dragPan={!drawing}
      touchZoom={!drawing}
      rotateEnabled={!drawing}
      pitchEnabled={!drawing}
      style={{ height }}
      onTouchStart={expanded ? undefined : () => holdPage(true)}
      onTouchEnd={expanded ? undefined : () => holdPage(false)}
      onTouchCancel={expanded ? undefined : () => holdPage(false)}
      onRegionDidChange={(event: RegionEvent) => {
        if (event.nativeEvent?.userInteraction !== true) return;
        const center = event.nativeEvent?.center;
        const zoom = event.nativeEvent?.zoom;
        if (!center || center.length < 2 || typeof zoom !== 'number') return;
        remember({ longitude: center[0], latitude: center[1], zoom });
        moved.current?.();
      }}
      onPress={(event: unknown) => {
        if (drawRef.current?.enabled) return;
        if (!adjust?.enabled) return;
        const point = mapPressPoint(event);
        if (!point) return;
        adjust.onTap(point);
      }}
    >
      <maps.Camera ref={camera} initialViewState={{ center: [place.longitude, place.latitude], zoom: place.zoom }} />
      <maps.GeoJSONSource id="saved" data={savedLineCollection(routes)} />
      <maps.Layer id="saved-line" type="line" source="saved" paint={{ 'line-color': green, 'line-width': 4 }} />
      <maps.GeoJSONSource id="sketch" data={sketchLineCollection(sketch)} />
      <maps.Layer
        id="sketch-line"
        type="line"
        source="sketch"
        paint={{ 'line-color': green, 'line-width': 6 }}
      />
      <maps.GeoJSONSource id="track" data={trackLineCollection(track)} />
      <maps.Layer id="track-line" type="line" source="track" paint={{ 'line-color': walked, 'line-width': 5 }} />
      <maps.GeoJSONSource id="start" data={startCollection(routes, sketch, startPoint)} />
      <maps.Layer
        id="start-dot"
        type="circle"
        source="start"
        paint={{ 'circle-radius': 6, 'circle-color': green, 'circle-stroke-width': 2, 'circle-stroke-color': '#F3F3EE' }}
      />
      <maps.GeoJSONSource id="guide" data={sketchLineCollection(pencil)} />
      <maps.Layer
        id="guide-line"
        type="line"
        source="guide"
        paint={{ 'line-color': pencilColour(scheme), 'line-width': 7 }}
      />
      <maps.GeoJSONSource id="vias" data={viaPointCollection(adjust?.vias ?? [])} />
      <maps.Layer
        id="via-dot"
        type="circle"
        source="vias"
        paint={{ 'circle-radius': 12, 'circle-color': '#0C0C0C', 'circle-stroke-width': 3, 'circle-stroke-color': '#D1FAE5' }}
      />
      <maps.GeoJSONSource id="via-selected" data={viaPointCollection(selected ? [selected] : [])} />
      <maps.Layer
        id="via-selected-ring"
        type="circle"
        source="via-selected"
        paint={{ 'circle-radius': 16, 'circle-color': 'transparent', 'circle-stroke-width': 3, 'circle-stroke-color': '#F3F3EE' }}
      />
      <maps.GeoJSONSource id="pin" data={pinCollection(pin)} />
      <maps.Layer
        id="pin-dot"
        type="circle"
        source="pin"
        paint={{ 'circle-radius': 8, 'circle-color': pencilColour(scheme), 'circle-stroke-width': 3, 'circle-stroke-color': '#F3F3EE' }}
      />
      <maps.GeoJSONSource id="you" data={youAreHereCollection(here)} />
      <maps.Layer
        id="you-dot"
        type="circle"
        source="you"
        paint={{ 'circle-radius': 8, 'circle-color': YOU_HERE_FILL, 'circle-stroke-width': 3, 'circle-stroke-color': YOU_HERE_RING }}
      />
    </maps.Map>
    {drawing ? (
      <DrawCapture
        readView={() => ({
          centre: { latitude: held.current.latitude, longitude: held.current.longitude },
          zoom: held.current.zoom,
          width: size.current.width,
          height: size.current.height || height,
        })}
        onChange={(points) => drawRef.current?.onChange(points)}
        onEnd={(points) => drawRef.current?.onEnd(points)}
        onView={showDrawnView}
      />
    ) : null}
    {drawing ? <DrawZoomButtons onZoom={zoomBy} /> : null}
    </View>
  );
}
