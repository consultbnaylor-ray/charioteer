import { useCallback, useEffect, useRef, useState } from 'react';

import { viewCentre, type OutdoorPoint, type OutdoorRoute } from '@/domain/outdoorRoute';

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

export function followCamera(
  current: HeldCamera,
  framed: HeldCamera,
  follow: boolean | undefined,
): HeldCamera | null {
  if (follow === false) return null;
  if (follow === true) return { longitude: framed.longitude, latitude: framed.latitude, zoom: current.zoom };
  return framed;
}

/**
 * The last pan and zoom. A new route or "show my location" frames the map.
 * Closing full screen restores this camera instead of jumping back to the start.
 * An outing passes follow so a pan sticks until re-centre.
 */
export function useHeldCamera(
  routes: readonly OutdoorRoute[],
  sketch: readonly OutdoorPoint[],
  here: OutdoorPoint | null,
  locationFocus: number,
  follow?: boolean,
  track: readonly OutdoorPoint[] = [],
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
  return { held, frameTick, restoreTick, remember, restore };
}
