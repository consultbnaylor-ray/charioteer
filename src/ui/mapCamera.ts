import { useCallback, useEffect, useRef, useState } from 'react';

import { routeFrame, viewCentre, type OutdoorPoint, type OutdoorRoute } from '@/domain/outdoorRoute';

export type HeldCamera = {
  longitude: number;
  latitude: number;
  zoom: number;
};

function frameOf(
  routes: readonly OutdoorRoute[],
  sketch: readonly OutdoorPoint[],
  here: OutdoorPoint | null,
  locationFocus: number,
  track: readonly OutdoorPoint[] = [],
): HeldCamera {
  const hasRoute = routes.some((route) => route.points.length > 0);
  // A route line on its own is framed whole: centred, and zoomed to fit.
  const fitted = !sketch.length && locationFocus <= 0 ? routeFrame(routes) : null;
  if (fitted) return fitted;
  const walked = !sketch.length && !hasRoute && !here && track.length >= 2
    ? track[Math.floor(track.length / 2)]
    : null;
  const framed = walked ?? viewCentre(routes, sketch, here);
  const centre = locationFocus > 0 && here ? here : framed;
  const zoom = locationFocus > 0 || sketch.length || routes.length || here || walked ? 15 : 12;
  return { longitude: centre.longitude, latitude: centre.latitude, zoom };
}

/**
 * Moves the camera after the native map exists.
 * MapLibre throws if flyTo runs before the native camera has a node.
 * That throw is inside a React effect, and on iOS an effect error is fatal.
 * A miss returns false so the caller can try again next frame. The map's
 * initial view already has this centre.
 */
/** Pinch and the zoom buttons move the camera in place. A flight would lag behind the fingers. */
export function jumpWhenReady(
  camera: { flyTo: (options: { center: [number, number]; zoom?: number; duration?: number }) => void } | null,
  place: HeldCamera,
): boolean {
  if (!camera) return false;
  if (!Number.isFinite(place.longitude) || !Number.isFinite(place.latitude) || !Number.isFinite(place.zoom)) return false;
  try {
    camera.flyTo({ center: [place.longitude, place.latitude], zoom: place.zoom, duration: 0 });
    return true;
  } catch {
    return false;
  }
}

export function flyWhenReady(
  camera: { flyTo: (options: { center: [number, number]; zoom?: number; duration?: number }) => void } | null,
  place: HeldCamera,
): boolean {
  if (!camera) return false;
  if (!Number.isFinite(place.longitude) || !Number.isFinite(place.latitude) || !Number.isFinite(place.zoom)) return false;
  try {
    camera.flyTo({ center: [place.longitude, place.latitude], zoom: place.zoom, duration: 500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Follow moves the centre and keeps the zoom. A pan passes follow false and the camera stays.
 * The route map leaves follow unset and takes the framed camera, zoom included.
 */
/**
 * The embedded map sits in the page scroll view, so a finger there turns page scrolling off.
 * The full-screen map is a modal outside that scroll view. Turning page scrolling off from
 * the modal re-renders the page during the pinch, and that layout pass interrupts the zoom.
 * Null means leave the page scroll as it is.
 */
export function pageScrollForMapTouch(expanded: boolean, fingerDown: boolean): boolean | null {
  if (expanded) return null;
  return !fingerDown;
}

/**
 * The full-screen map is a native MapLibre view inside a React Native modal.
 * Hiding that modal in the same update that destroys the map tears the map down
 * during the modal transition. On iOS that locks the main thread, so the screen
 * freezes. A second MapLibre view left mounted underneath, then destroyed while
 * the modal animates, is the same lock. A draw layer that still owns the touch
 * makes it worse: the touch lock is left behind when the view disappears.
 * Open and close therefore take a spare frame. One map is unmounted, then the
 * modal shows or hides, and the draw layer is already gone before the modal goes.
 */
export type FullScreenPhase = 'closed' | 'opening' | 'open' | 'closing';

export type FullScreenAction = 'expand' | 'mount-map' | 'unmount-map' | 'hide-modal';

export function nextFullScreenPhase(phase: FullScreenPhase, action: FullScreenAction): FullScreenPhase {
  if (action === 'expand' && phase === 'closed') return 'opening';
  if (action === 'mount-map' && phase === 'opening') return 'open';
  if (action === 'unmount-map' && (phase === 'open' || phase === 'opening')) return 'closing';
  if (action === 'hide-modal' && phase === 'closing') return 'closed';
  return phase;
}

/** The modal stays up while the native map is removed, then hides on the next frame. */
export function fullScreenModalVisible(phase: FullScreenPhase): boolean {
  return phase !== 'closed';
}

/** Only the settled full-screen phase hosts a MapLibre view. */
export function fullScreenShowsNativeMap(phase: FullScreenPhase): boolean {
  return phase === 'open';
}

/** The map in the page is mounted only while the modal is fully gone. */
export function inlineMapMounted(phase: FullScreenPhase): boolean {
  return phase === 'closed';
}

export function followCamera(
  current: HeldCamera,
  framed: HeldCamera,
  follow: boolean | undefined,
): HeldCamera | null {
  if (follow === false) return null;
  if (follow === true) return { longitude: framed.longitude, latitude: framed.latitude, zoom: current.zoom };
  return framed;
}

/** The map with nothing drawn. A known location uses that point. Otherwise the default view. */
export function restingMapCamera(here: OutdoorPoint | null): HeldCamera {
  return frameOf([], [], here, 0, []);
}

/**
 * The last pan and zoom. A new route or "show my location" frames the map.
 * Closing full screen restores this camera instead of jumping back to the start.
 * An outing passes follow so a pan sticks until re-centre.
 * `homeTick` applies that frame again after the person resets, even if they had panned.
 */
export function useHeldCamera(
  routes: readonly OutdoorRoute[],
  sketch: readonly OutdoorPoint[],
  here: OutdoorPoint | null,
  locationFocus: number,
  follow?: boolean,
  track: readonly OutdoorPoint[] = [],
  pinned: OutdoorPoint | null = null,
  pinTick = 0,
  homeTick = 0,
) {
  const next = frameOf(routes, sketch, here, locationFocus, track);
  const held = useRef<HeldCamera>(follow === true ? { ...next, zoom: 16 } : next);
  const nextRef = useRef(next);
  nextRef.current = next;
  const [frameTick, setFrameTick] = useState(0);
  const [restoreTick, setRestoreTick] = useState(0);
  const seen = useRef('');
  const wasFollowing = useRef(follow);
  const key = `${next.latitude.toFixed(5)}:${next.longitude.toFixed(5)}:${next.zoom}:${locationFocus}:${follow === false ? 'still' : 'move'}`;
  useEffect(() => {
    const resumed = follow === true && wasFollowing.current === false;
    wasFollowing.current = follow;
    if (!resumed && seen.current === key) return;
    const nextCamera = followCamera(held.current, nextRef.current, follow);
    seen.current = key;
    if (!nextCamera) return;
    held.current = nextCamera;
    setFrameTick((value) => value + 1);
  }, [key, follow]);
  const remember = useCallback((camera: HeldCamera) => {
    held.current = camera;
  }, []);
  const restore = useCallback(() => {
    setRestoreTick((value) => value + 1);
  }, []);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const focusRef = useRef(locationFocus);
  const followRef = useRef(follow);
  focusRef.current = locationFocus;
  followRef.current = follow;
  useEffect(() => {
    const place = pinnedRef.current;
    if (!place || pinTick <= 0) return;
    held.current = { longitude: place.longitude, latitude: place.latitude, zoom: 15 };
    setFrameTick((value) => value + 1);
  }, [pinTick]);
  useEffect(() => {
    if (homeTick <= 0) return;
    const following = followRef.current;
    const nextCamera = followCamera(held.current, nextRef.current, following);
    if (!nextCamera) return;
    const same = held.current.latitude === nextCamera.latitude
      && held.current.longitude === nextCamera.longitude
      && held.current.zoom === nextCamera.zoom;
    held.current = nextCamera;
    seen.current = `${nextCamera.latitude.toFixed(5)}:${nextCamera.longitude.toFixed(5)}:${nextCamera.zoom}:${focusRef.current}:${following === false ? 'still' : 'move'}`;
    if (!same) setFrameTick((value) => value + 1);
  }, [homeTick]);
  return { held, frameTick, restoreTick, remember, restore };
}

type MapGestures = {
  dragPan?: { enable: () => void; disable: () => void };
  scrollZoom?: { enable: () => void; disable: () => void };
  touchZoomRotate?: { enable: () => void; disable: () => void };
  doubleClickZoom?: { enable: () => void; disable: () => void };
  boxZoom?: { enable: () => void; disable: () => void };
};

/** Drawing needs the finger for the line. Pan and zoom wait until the pencil is off. */
export function holdMapGestures(map: MapGestures | null, drawing: boolean): void {
  if (!map) return;
  const method = drawing ? 'disable' : 'enable';
  map.dragPan?.[method]();
  map.scrollZoom?.[method]();
  map.touchZoomRotate?.[method]();
  map.doubleClickZoom?.[method]();
  map.boxZoom?.[method]();
}
