import { useEffect, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';

import { VIA_POINT_CAP, viaPointCollection } from '@/domain/routeAdjust';
import {
  YOU_HERE_FILL,
  YOU_HERE_RING,
  mapLineColour,
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
import { useHeldCamera, type HeldCamera } from '@/ui/mapCamera';
import { MapFrame } from '@/ui/MapChrome';
import { useMapScheme } from '@/ui/mapStyle';
import { T, useScreenScroller } from '@/ui/ui';

type CameraHandle = {
  flyTo: (options: { center: [number, number]; zoom?: number; duration?: number }) => void;
};

type RegionEvent = {
  nativeEvent?: { center?: [number, number]; zoom?: number; userInteraction?: boolean };
};

type AnnotationEvent = { nativeEvent?: { lngLat?: unknown } };

type AnnotationProps = {
  id: string;
  draggable?: boolean;
  lngLat: [number, number];
  anchor?: string;
  onDragStart?: (event: AnnotationEvent) => void;
  onDrag?: (event: AnnotationEvent) => void;
  onDragEnd?: (event: AnnotationEvent) => void;
  onPress?: (event: AnnotationEvent) => void;
  children: ReactNode;
};

type Maps = {
  Map: ComponentType<Record<string, unknown>>;
  Camera: ComponentType<{ ref?: Ref<CameraHandle> } & Record<string, unknown>>;
  GeoJSONSource: ComponentType<Record<string, unknown>>;
  Layer: ComponentType<Record<string, unknown>>;
  ViewAnnotation?: ComponentType<AnnotationProps>;
};

function annotationPoint(event: AnnotationEvent): OutdoorPoint | null {
  const pair = event.nativeEvent?.lngLat;
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const longitude = Number(pair[0]);
  const latitude = Number(pair[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { latitude, longitude };
}

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
    guide: readonly OutdoorPoint[];
    onDown: (point: OutdoorPoint) => void;
    onMove: (point: OutdoorPoint) => void;
    onUp: (point: OutdoorPoint) => void;
  } | null;
  /** Shown under the map while it is full screen. */
  bar?: ReactNode;
  /** Accessible name. Omitted maps keep "Map with footpaths". */
  mapLabel?: string;
}) {
  const [scheme, choose] = useMapScheme();
  const camera = useHeldCamera(routes, sketch, here, locationFocus, follow, track);
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
      renderMap={({ height: viewHeight }) => (
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
        />
      )}
    />
  );
}

function ViaHandle({
  Annotation,
  via,
  index,
  onDown,
  onMove,
  onUp,
  onActive,
}: {
  Annotation: ComponentType<AnnotationProps>;
  via: OutdoorPoint;
  index: number;
  onDown: (point: OutdoorPoint) => void;
  onMove: (point: OutdoorPoint) => void;
  onUp: (point: OutdoorPoint) => void;
  onActive: (active: boolean) => void;
}) {
  const [hold, setHold] = useState(via);
  const dragging = useRef(false);
  const holdRef = useRef(hold);
  const onActiveRef = useRef(onActive);
  holdRef.current = hold;
  onActiveRef.current = onActive;
  useEffect(() => {
    if (dragging.current) return;
    setHold((current) => (current.latitude === via.latitude && current.longitude === via.longitude ? current : via));
  }, [via, via.latitude, via.longitude]);
  useEffect(() => () => {
    if (!dragging.current) return;
    dragging.current = false;
    onActiveRef.current(false);
  }, []);

  const pointOrHold = (event: AnnotationEvent): OutdoorPoint => annotationPoint(event) ?? holdRef.current;

  return (
    <Annotation
      id={`via-${index}`}
      draggable
      lngLat={[hold.longitude, hold.latitude]}
      anchor="center"
      onDragStart={(event) => {
        const point = pointOrHold(event);
        dragging.current = true;
        onActive(true);
        setHold(point);
        onDown(point);
      }}
      onDrag={(event) => {
        const point = annotationPoint(event);
        if (!point) return;
        setHold(point);
        onMove(point);
      }}
      onDragEnd={(event) => {
        const point = pointOrHold(event);
        setHold(point);
        onUp(point);
        requestAnimationFrame(() => {
          dragging.current = false;
          onActive(false);
        });
      }}
      onPress={(event) => {
        if (dragging.current) return;
        const point = pointOrHold(event);
        onDown(point);
        onUp(point);
      }}
    >
      <View
        accessibilityLabel={`Via point ${index + 1} of ${VIA_POINT_CAP}`}
        collapsable={false}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#0C0C0C',
            borderWidth: 3,
            borderColor: '#D1FAE5',
          }}
        />
      </View>
    </Annotation>
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
  adjust: {
    enabled: boolean;
    vias: readonly OutdoorPoint[];
    guide: readonly OutdoorPoint[];
    onDown: (point: OutdoorPoint) => void;
    onMove: (point: OutdoorPoint) => void;
    onUp: (point: OutdoorPoint) => void;
  } | null;
}) {
  const camera = useRef<CameraHandle>(null);
  const moved = useRef(onUserMove);
  moved.current = onUserMove;
  const scroller = useScreenScroller();
  const viaDrag = useRef(false);
  const green = mapLineColour(scheme);
  const walked = trackLineColour(scheme);
  const place = held.current;
  const setViaDrag = (active: boolean) => {
    viaDrag.current = active;
    scroller?.current?.setScrollEnabled?.(!active);
  };

  useEffect(() => {
    const next = held.current;
    camera.current?.flyTo({ center: [next.longitude, next.latitude], zoom: next.zoom, duration: 500 });
  }, [held, frameTick, restoreTick]);

  useEffect(() => () => {
    viaDrag.current = false;
    scroller?.current?.setScrollEnabled?.(true);
  }, [scroller]);

  if (!maps) {
    return (
      <View style={{ height, justifyContent: 'center', padding: 16 }}>
        <T>The footpath map loads in the iPhone and Android app.</T>
      </View>
    );
  }
  const liveAdjust = adjust?.enabled ? adjust : null;
  const Annotation = maps.ViewAnnotation;
  const showHandles = Boolean(liveAdjust && Annotation && liveAdjust.vias.length > 0);
  return (
    <maps.Map
      mapStyle={openFreeMapStyle(scheme)}
      attribution
      attributionPosition={{ bottom: 8, right: 8 }}
      style={{ height }}
      onRegionDidChange={(event: RegionEvent) => {
        if (event.nativeEvent?.userInteraction !== true) return;
        const center = event.nativeEvent?.center;
        const zoom = event.nativeEvent?.zoom;
        if (!center || center.length < 2 || typeof zoom !== 'number') return;
        remember({ longitude: center[0], latitude: center[1], zoom });
        moved.current?.();
      }}
      onPress={(event: { coordinates?: { latitude?: number; longitude?: number }; geometry?: { coordinates?: number[] } }) => {
        if (viaDrag.current) return;
        if (!adjust?.enabled) return;
        const pair = event.geometry?.coordinates;
        const point = pair && pair.length >= 2
          ? { longitude: Number(pair[0]), latitude: Number(pair[1]) }
          : event.coordinates && typeof event.coordinates.latitude === 'number' && typeof event.coordinates.longitude === 'number'
            ? { latitude: event.coordinates.latitude, longitude: event.coordinates.longitude }
            : null;
        if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return;
        adjust.onDown(point);
        adjust.onUp(point);
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
        paint={{ 'line-color': green, 'line-width': 3, 'line-dasharray': [2, 1.4] }}
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
      <maps.GeoJSONSource id="guide" data={sketchLineCollection(adjust?.guide ?? [])} />
      <maps.Layer
        id="guide-line"
        type="line"
        source="guide"
        paint={{ 'line-color': '#D1FAE5', 'line-width': 3, 'line-dasharray': [1.2, 1.2] }}
      />
      <maps.GeoJSONSource id="vias" data={viaPointCollection(showHandles ? [] : (adjust?.vias ?? []))} />
      <maps.Layer
        id="via-dot"
        type="circle"
        source="vias"
        paint={{ 'circle-radius': 12, 'circle-color': '#0C0C0C', 'circle-stroke-width': 3, 'circle-stroke-color': '#D1FAE5' }}
      />
      {liveAdjust && Annotation
        ? liveAdjust.vias.map((via, index) => (
          <ViaHandle
            key={`via-${index}`}
            Annotation={Annotation}
            via={via}
            index={index}
            onDown={liveAdjust.onDown}
            onMove={liveAdjust.onMove}
            onUp={liveAdjust.onUp}
            onActive={setViaDrag}
          />
        ))
        : null}
      <maps.GeoJSONSource id="you" data={youAreHereCollection(here)} />
      <maps.Layer
        id="you-dot"
        type="circle"
        source="you"
        paint={{ 'circle-radius': 8, 'circle-color': YOU_HERE_FILL, 'circle-stroke-width': 3, 'circle-stroke-color': YOU_HERE_RING }}
      />
    </maps.Map>
  );
}
