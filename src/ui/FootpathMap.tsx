import { useEffect, useImperativeHandle, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';

import { mapPressPoint, viaPointCollection } from '@/domain/routeAdjust';
import { clampDrawZoom, freshOverlayMeasure, nextOverlayMeasure, pageScrollsWhileDrawing } from '@/domain/drawStroke';
import { panViewport, type PanDirection } from '@/domain/drawStroke';
import { DrawCapture, DrawViewControls, DrawZoomButtons } from '@/ui/DrawCapture';
import { RUBBER_RADIUS_PX, rubberRadiusMetres, type DrawTool } from '@/domain/drawErase';
import {
  YOU_HERE_FILL,
  YOU_HERE_RING,
  DRAW_GAP_DASH,
  DRAW_GAP_WIDTH,
  drawGapColour,
  mapLineColour,
  pencilColour,
  pinCollection,
  openFreeMapStyle,
  savedLineCollection,
  sketchLineCollection,
  sketchLinesCollection,
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
  pencilLines = null,
  gaps = [],
  lookAt = null,
  lookFocus = 0,
  draw = null,
  pin = null,
  onToggleDraw,
  onUndoDraw,
  onClearDraw,
  onConfirmDraw,
  onExitDraw,
  canUndoDraw = false,
  canClearDraw = false,
  canConfirmDraw = false,
  confirmPending = false,
  statusNote = null,
  homeTick = 0,
  sketchPieces = null,
  onRubber,
  onRecalculate,
  canRecalculate = false,
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
  /** The finger sketch, one line. `pencilLines` draws each stroke on its own. */
  pencil?: readonly OutdoorPoint[];
  /** Each stroke on its own. A gap between strokes is not part of these lines. */
  pencilLines?: readonly (readonly OutdoorPoint[])[] | null;
  /** Thin dashed hints between strokes. Not a finger stroke. */
  gaps?: readonly (readonly OutdoorPoint[])[];
  /** A searched place. `lookFocus` increments when the map should move there. */
  lookAt?: OutdoorPoint | null;
  lookFocus?: number;
  draw?: {
    enabled: boolean;
    onChange: (points: OutdoorPoint[]) => void;
    onEnd: (points: OutdoorPoint[]) => void;
    /** 'rubber' turns a drag into a wipe. The pen is the default. */
    tool?: DrawTool;
    /** The rubber's drag path, and how far it reaches on the ground at the current zoom. */
    onErase?: (path: OutdoorPoint[], radiusM: number) => void;
  } | null;
  /** A searched place. The map draws a pin. The camera moves only when `lookFocus` changes. */
  pin?: OutdoorPoint | null;
  onToggleDraw?: () => void;
  onUndoDraw?: () => void;
  onClearDraw?: () => void;
  onConfirmDraw?: () => void;
  /** Leaves draw mode and keeps the sketch, when the full-screen map closes. */
  onExitDraw?: () => void;
  canUndoDraw?: boolean;
  canClearDraw?: boolean;
  canConfirmDraw?: boolean;
  confirmPending?: boolean;
  /** Shown on the map after drawing finishes. A snap uses the green chip. */
  statusNote?: string | null;
  /** Increments to frame the map on the current location, or the default view. */
  homeTick?: number;
  /** What is left of the snapped line after a wipe. Drawn in place of `sketch` when set. */
  sketchPieces?: readonly (readonly OutdoorPoint[])[] | null;
  onRubber?: () => void;
  onRecalculate?: () => void;
  canRecalculate?: boolean;
}) {
  const [scheme, choose] = useMapScheme();
  const styleUrl = openFreeMapStyle(scheme);
  const mapStyle = useFootpathStyle(scheme, styleUrl);
  const scroller = useScreenScroller();
  const drawingOn = draw?.enabled === true;
  // This map owns the page lock while drawing. Turning draw mode off (pen, X,
  // closing full screen, a snapped route) or leaving the screen gives the scroll back.
  useEffect(() => {
    if (pageScrollsWhileDrawing(drawingOn)) return undefined;
    scroller?.current?.setScrollEnabled?.(false);
    return () => {
      scroller?.current?.setScrollEnabled?.(true);
    };
  }, [drawingOn, scroller]);
  const camera = useHeldCamera(routes, sketch, here, locationFocus, follow, track, lookAt, lookFocus, homeTick);
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
      onExitDraw={onExitDraw}
      canUndoDraw={canUndoDraw}
      canClearDraw={canClearDraw}
      canConfirmDraw={canConfirmDraw}
      confirmPending={confirmPending}
      statusNote={statusNote}
      drawTool={draw?.tool ?? 'pen'}
      onRubber={onRubber}
      onRecalculate={onRecalculate}
      canRecalculate={canRecalculate}
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
          sketchPieces={sketchPieces}
          here={here}
          startPoint={startPoint}
          track={track}
          onUserMove={onUserMove}
          adjust={adjust}
          expanded={expanded}
          pencil={pencil}
          pencilLines={pencilLines}
          gaps={gaps}
          pin={pin}
          draw={draw}
          mapStyle={mapStyle}
        />
      )}
    />
  );
}

type LiveStrokeHandle = { show: (points: OutdoorPoint[]) => void };

/**
 * The stroke under the finger, while it is being drawn.
 * It keeps its own state, so a new sample re-renders only this source and layer.
 * The route screen and the rest of the map do not re-render until the finger lifts.
 * A render of the whole screen per sample held the JS thread, the coalesced
 * touchMove events in between were dropped, and the first stroke became a chord.
 */
/** The rubber's trail while the finger is down: a wide, faint grey band the width of the rubber. */
const RUBBER_TRAIL = '#6B7280';

function LiveStroke({
  maps,
  colour,
  width = 7,
  opacity = 1,
  ref,
}: {
  maps: Maps;
  colour: string;
  width?: number;
  opacity?: number;
  ref?: Ref<LiveStrokeHandle>;
}) {
  const [points, setPoints] = useState<OutdoorPoint[]>([]);
  useImperativeHandle(ref, () => ({ show: (next: OutdoorPoint[]) => setPoints(next) }), []);
  return (
    <>
      <maps.GeoJSONSource id="guide-live" tolerance={0} data={sketchLineCollection(points)} />
      <maps.Layer
        id="guide-live-line"
        type="line"
        source="guide-live"
        paint={{ 'line-color': colour, 'line-width': width, 'line-opacity': opacity }}
      />
    </>
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
  sketchPieces,
  here,
  startPoint,
  track,
  onUserMove,
  adjust,
  expanded,
  pencil,
  pencilLines,
  gaps,
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
  sketchPieces: readonly (readonly OutdoorPoint[])[] | null;
  here: OutdoorPoint | null;
  startPoint: OutdoorPoint | null;
  track: readonly OutdoorPoint[];
  onUserMove?: () => void;
  adjust: MapAdjust | null;
  expanded: boolean;
  pencil: readonly OutdoorPoint[];
  pencilLines: readonly (readonly OutdoorPoint[])[] | null;
  gaps: readonly (readonly OutdoorPoint[])[];
  pin: OutdoorPoint | null;
  draw: {
    enabled: boolean;
    onChange: (points: OutdoorPoint[]) => void;
    onEnd: (points: OutdoorPoint[]) => void;
    /** 'rubber' turns a drag into a wipe. The pen is the default. */
    tool?: DrawTool;
    /** The rubber's drag path, and how far it reaches on the ground at the current zoom. */
    onErase?: (path: OutdoorPoint[], radiusM: number) => void;
  } | null;
  mapStyle: string | object;
}) {
  const camera = useRef<CameraHandle>(null);
  const host = useRef<View>(null);
  const laidOut = useRef({ width: 0, height: 0 });
  const measureState = useRef(freshOverlayMeasure());
  const confirmFrame = useRef(0);
  const box = useRef({ ready: false, originX: 0, originY: 0, width: 0, height: 0 });
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const live = useRef<LiveStrokeHandle>(null);
  const moved = useRef(onUserMove);
  moved.current = onUserMove;
  const scroller = useScreenScroller();
  const green = mapLineColour(scheme);
  const walked = trackLineColour(scheme);
  const place = held.current;
  const [zoom, setZoom] = useState(held.current.zoom);
  useEffect(() => {
    setZoom(held.current.zoom);
  }, [held, frameTick, restoreTick]);

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
      // While drawing, FootpathMap holds the lock and releases it when draw mode ends.
      // Setting it here as well could leave the page stuck after that release.
      if (drawRef.current?.enabled) return;
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
  const rubbing = drawing && draw?.tool === 'rubber';

  function showDrawnView(next: { centre: OutdoorPoint; zoom: number }) {
    const place = {
      longitude: next.centre.longitude,
      latitude: next.centre.latitude,
      zoom: clampDrawZoom(next.zoom),
    };
    remember(place);
    jumpWhenReady(camera.current, place);
    setZoom(place.zoom);
  }

  function zoomTo(nextZoom: number) {
    const current = held.current;
    showDrawnView({
      centre: { latitude: current.latitude, longitude: current.longitude },
      zoom: nextZoom,
    });
  }

  function publishBox(ready: { x: number; y: number; width: number; height: number } | null) {
    box.current = ready
      ? { ready: true, originX: ready.x, originY: ready.y, width: ready.width, height: ready.height }
      : { ready: false, originX: 0, originY: 0, width: 0, height: 0 };
  }

  function measureBox() {
    host.current?.measureInWindow((x, y, width, measuredHeight) => {
      const outcome = nextOverlayMeasure(
        measureState.current,
        { x, y, width, height: measuredHeight },
        laidOut.current,
      );
      measureState.current = outcome.state;
      publishBox(outcome.state.ready);
      if (!outcome.again) return;
      cancelAnimationFrame(confirmFrame.current);
      confirmFrame.current = requestAnimationFrame(() => measureBox());
    });
  }

  function pan(direction: PanDirection) {
    const current = held.current;
    const centre = panViewport({
      centre: { latitude: current.latitude, longitude: current.longitude },
      zoom: current.zoom,
      width: box.current.width,
      height: box.current.height,
      direction,
    });
    if (!centre) return;
    showDrawnView({ centre, zoom: current.zoom });
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
      ref={host}
      style={{ height }}
      onLayout={(event) => {
        const next = {
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        };
        const previous = laidOut.current;
        laidOut.current = next;
        if (Math.abs(next.width - previous.width) > 2 || Math.abs(next.height - previous.height) > 2) {
          measureState.current = freshOverlayMeasure();
          publishBox(null);
        }
        measureBox();
      }}
    >
    <maps.Map
      mapStyle={mapStyle}
      attribution={false}
      pointerEvents={drawing ? 'none' : 'auto'}
      dragPan={!drawing}
      touchZoom={!drawing}
      rotateEnabled={!drawing}
      pitchEnabled={!drawing}
      style={{ height }}
      onTouchStart={expanded ? undefined : () => holdPage(true)}
      onTouchEnd={expanded ? undefined : () => holdPage(false)}
      onTouchCancel={expanded ? undefined : () => holdPage(false)}
      onRegionDidChange={(event: RegionEvent) => {
        if (drawRef.current?.enabled) return;
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
      <maps.GeoJSONSource id="sketch" data={sketchPieces ? sketchLinesCollection(sketchPieces) : sketchLineCollection(sketch)} />
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
      {/* tolerance 0: the default Douglas-Peucker turns a finger curve into long chords. */}
      <maps.GeoJSONSource id="guide" tolerance={0} data={pencilLines ? sketchLinesCollection(pencilLines) : sketchLineCollection(pencil)} />
      <maps.Layer
        id="guide-line"
        type="line"
        source="guide"
        paint={{ 'line-color': pencilColour(scheme), 'line-width': 7 }}
      />
      <LiveStroke ref={live} maps={maps}
        colour={rubbing ? RUBBER_TRAIL : pencilColour(scheme)}
        width={rubbing ? RUBBER_RADIUS_PX * 2 : 7}
        opacity={rubbing ? 0.35 : 1}
      />
      <maps.GeoJSONSource id="gap" tolerance={0} data={sketchLinesCollection(gaps)} />
      <maps.Layer
        id="gap-line"
        type="line"
        source="gap"
        paint={{
          'line-color': drawGapColour(scheme),
          'line-width': DRAW_GAP_WIDTH,
          'line-dasharray': DRAW_GAP_DASH,
        }}
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
        prepare={measureBox}
        readView={() => ({
          ready: box.current.ready,
          originX: box.current.originX,
          originY: box.current.originY,
          width: box.current.width,
          height: box.current.height,
          centre: { latitude: held.current.latitude, longitude: held.current.longitude },
          zoom: held.current.zoom,
        })}
        // The live line stays inside the map while the finger is down. The route
        // screen hears about the stroke once, when the finger lifts.
        onChange={(points) => live.current?.show(points)}
        onEnd={(points) => {
          live.current?.show([]);
          const current = drawRef.current;
          if (current?.tool === 'rubber') {
            // The rubber reaches about a fingertip on screen, whatever the zoom.
            const radiusM = rubberRadiusMetres(held.current.latitude, held.current.zoom);
            current.onErase?.(points, radiusM);
            return;
          }
          current?.onEnd(points);
        }}
        onView={showDrawnView}
      />
    ) : null}
    {drawing && expanded ? <DrawViewControls zoom={zoom} onZoom={zoomTo} onPan={pan} /> : null}
    {drawing && !expanded ? <DrawZoomButtons onZoom={zoomBy} /> : null}
    </View>
  );
}
