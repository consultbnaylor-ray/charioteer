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
): HeldCamera {
  const framed = viewCentre(routes, sketch, here);
  const centre = locationFocus > 0 && here ? here : framed;
  const zoom = locationFocus > 0 || sketch.length || routes.length || here ? 15 : 12;
  return { longitude: centre.longitude, latitude: centre.latitude, zoom };
}

/**
 * The last pan and zoom. A new route or "show my location" frames the map.
 * Closing full screen restores this camera instead of jumping back to the start.
 */
export function useHeldCamera(
  routes: readonly OutdoorRoute[],
  sketch: readonly OutdoorPoint[],
  here: OutdoorPoint | null,
  locationFocus: number,
) {
  const next = frameOf(routes, sketch, here, locationFocus);
  const held = useRef<HeldCamera>(next);
  const nextRef = useRef(next);
  nextRef.current = next;
  const [frameTick, setFrameTick] = useState(0);
  const [restoreTick, setRestoreTick] = useState(0);
  const seen = useRef('');
  const key = `${next.latitude.toFixed(5)}:${next.longitude.toFixed(5)}:${next.zoom}:${locationFocus}`;
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    held.current = nextRef.current;
    setFrameTick((value) => value + 1);
  }, [key]);
  const remember = useCallback((camera: HeldCamera) => {
    held.current = camera;
  }, []);
  const restore = useCallback(() => {
    setRestoreTick((value) => value + 1);
  }, []);
  return { held, frameTick, restoreTick, remember, restore };
}
