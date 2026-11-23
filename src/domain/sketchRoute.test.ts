import { describe, expect, it, vi } from 'vitest';

import {
  SEARCH_SLOW,
  parseRoutePlaces,
  withDeadline,
} from '@/domain/findRoute';
import { ROUTE_SKETCH_LINE } from '@/domain/routeConsent';
import {
  ORS_WAYPOINT_LIMIT,
  appendSketchPoint,
  closeSketchIfLoop,
  simplifySketch,
  viewToPoint,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';
import {
  PLACE_SEARCH_PAUSE_MS,
  createPlaceSearch,
  routePlanBody,
} from '@/domain/routeAdjust';
import {
  ORS_WAYPOINT_LIMIT as SERVER_WAYPOINT_LIMIT,
  PREFER_PATH_WEIGHTINGS,
  buildDirectionsBody,
  directionsUrl,
  readSketchPoints,
  routingMode,
} from '../../supabase/functions/_shared/orsRoute';

const start: OutdoorPoint = { latitude: 51.45, longitude: -2.59 };

function line(count: number, step = 0.001): OutdoorPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    latitude: start.latitude + index * step,
    longitude: start.longitude,
  }));
}

describe('sketch routes', () => {
  it('simplifies a straight sketch and keeps a real bend', () => {
    const straight = simplifySketch(line(12), 20);
    expect(straight).toHaveLength(2);
    expect(straight[0]).toEqual(line(12)[0]);
    expect(straight[1]?.latitude).toBeCloseTo(line(12)[11]?.latitude ?? 0, 5);

    const bent = [
      start,
      { latitude: 51.45, longitude: -2.585 },
      { latitude: 51.455, longitude: -2.585 },
    ];
    expect(simplifySketch(bent, 20)).toHaveLength(3);
    expect(simplifySketch(bent, 5_000)).toHaveLength(2);
    expect(closeSketchIfLoop(bent)).toEqual(bent);
    const loop = closeSketchIfLoop([
      start,
      { latitude: 51.451, longitude: -2.588 },
      { latitude: 51.4501, longitude: -2.5901 },
    ]);
    expect(loop[loop.length - 1]).toEqual(start);
  });

  it('caps a busy sketch at the OpenRouteService waypoint limit', () => {
    expect(ORS_WAYPOINT_LIMIT).toBe(50);
    expect(SERVER_WAYPOINT_LIMIT).toBe(ORS_WAYPOINT_LIMIT);
    const busy = Array.from({ length: 180 }, (_, index) => ({
      latitude: start.latitude + Math.sin(index / 3) * 0.01,
      longitude: start.longitude + index * 0.0004,
    }));
    const capped = simplifySketch(busy, 0, 8);
    expect(capped.length).toBeLessThanOrEqual(8);
    expect(capped.length).toBeGreaterThanOrEqual(2);
    expect(capped[0]).toEqual(busy[0]);
    expect(capped[capped.length - 1]).toEqual(busy[busy.length - 1]);
    const atLimit = simplifySketch(busy, 0, ORS_WAYPOINT_LIMIT);
    expect(atLimit.length).toBeLessThanOrEqual(ORS_WAYPOINT_LIMIT);
    expect(readSketchPoints(atLimit.map((point) => ({ ...point })))).toHaveLength(atLimit.length);
    expect(readSketchPoints(line(ORS_WAYPOINT_LIMIT + 1))).toBeNull();
    expect(readSketchPoints(undefined)).toEqual([]);
    const grown = line(8).reduce<OutdoorPoint[]>((points, point) => appendSketchPoint(points, point, 12), []);
    expect(grown.length).toBeGreaterThanOrEqual(2);
    expect(appendSketchPoint(grown, grown[grown.length - 1] ?? start, 12)).toHaveLength(grown.length);
  });

  it('builds a route request with and without the prefer-paths option', () => {
    const plain = routePlanBody({ mode: 'walk', shape: 'loop', start, distanceM: 5000 });
    expect(plain.preferPaths).toBe(false);
    expect(plain.sketch).toEqual([]);
    expect(plain.action).toBe('route');

    const wavy = line(80);
    const biased = routePlanBody({
      mode: 'walk',
      shape: 'a_to_b',
      start,
      end: wavy[wavy.length - 1],
      preferPaths: true,
      sketch: wavy,
      via: wavy,
    });
    expect(biased.preferPaths).toBe(true);
    expect(biased.sketch.length).toBeGreaterThanOrEqual(2);
    expect(biased.sketch.length).toBeLessThanOrEqual(ORS_WAYPOINT_LIMIT);
    expect(biased.via.length).toBeLessThanOrEqual(5);
    expect(biased.sketch[0]?.latitude).toBeCloseTo(wavy[0]?.latitude ?? 0, 4);
    expect(biased.sketch[biased.sketch.length - 1]?.latitude).toBeCloseTo(wavy[wavy.length - 1]?.latitude ?? 0, 4);

    const loop = buildDirectionsBody({ mode: 'walk', shape: 'loop', start, lengthM: 5000, preferPaths: false });
    expect(loop?.options).toEqual({ round_trip: { length: 5000, points: 5 } });
    const preferred = buildDirectionsBody({ mode: 'walk', shape: 'loop', start, lengthM: 5000, preferPaths: true });
    expect(preferred?.options).toEqual({
      round_trip: { length: 5000, points: 5 },
      profile_params: { weightings: { ...PREFER_PATH_WEIGHTINGS } },
    });
    const through = buildDirectionsBody({
      mode: 'cycle',
      shape: 'a_to_b',
      start,
      end: { latitude: 51.46, longitude: -2.58 },
      lengthM: 5000,
      preferPaths: true,
      via: [{ latitude: 51.455, longitude: -2.585 }],
    });
    expect(through?.options).toEqual({ profile_params: { weightings: { green: 1, quiet: 1 } } });
    expect(through?.coordinates).toEqual([[-2.59, 51.45], [-2.585, 51.455], [-2.58, 51.46]]);

    const sketched = buildDirectionsBody({
      mode: 'walk',
      shape: 'loop',
      start,
      lengthM: 5000,
      preferPaths: true,
      sketch: [start, { latitude: 51.452, longitude: -2.588 }, start],
    });
    expect(sketched?.coordinates).toEqual([[-2.59, 51.45], [-2.588, 51.452], [-2.59, 51.45]]);
    expect(sketched?.options).toEqual({ profile_params: { weightings: { green: 1, quiet: 1 } } });
    expect(JSON.stringify(sketched)).not.toContain('round_trip');

    expect(routingMode('walk', false)).toBe('walk');
    expect(routingMode('walk', true)).toBe('run');
    expect(routingMode('run', true)).toBe('run');
    expect(routingMode('cycle', true)).toBe('cycle');
    expect(directionsUrl(routingMode('walk', true))).toContain('/foot-hiking/');
    expect(directionsUrl(routingMode('walk', false))).toContain('/foot-walking/');
    expect(directionsUrl(routingMode('cycle', true))).toContain('/cycling-regular/');
  });

  it('reads a short geocode list and ignores a bad hit', () => {
    const places = parseRoutePlaces({
      features: [
        { geometry: { coordinates: [-2.5945, 51.4504] }, properties: { label: '  Queen Square  ', gid: 'square' } },
        { geometry: { coordinates: [-2.59, 51.45] }, properties: { name: '' } },
        { geometry: { coordinates: [0, 99] }, properties: { label: 'Off the map' } },
        { id: 'same', name: 'First', latitude: 51.5, longitude: -2.5 },
        { id: 'same', name: 'Second', latitude: 51.6, longitude: -2.6 },
        ...line(6).map((point, index) => ({
          id: `p-${index}`,
          name: `Place ${index}`,
          latitude: point.latitude,
          longitude: point.longitude,
        })),
      ],
    });
    expect(places[0]).toEqual({ id: 'square', name: 'Queen Square', latitude: 51.4504, longitude: -2.5945 });
    expect(places.some((place) => place.name === 'Off the map' || place.name === 'Second' || place.name === '')).toBe(false);
    expect(places.filter((place) => place.id === 'same')).toHaveLength(1);
    expect(places).toHaveLength(5);
    expect(parseRoutePlaces({ places: [{ name: 'No point' }] })).toEqual([]);
    expect(ROUTE_SKETCH_LINE).toContain('words you type');
    expect(ROUTE_SKETCH_LINE).toContain('sketch sends its points');
  });

  it('waits before a place search and stops waiting if nothing answers', async () => {
    vi.useFakeTimers();
    try {
      const sent: string[] = [];
      const search = createPlaceSearch((query) => sent.push(query), PLACE_SEARCH_PAUSE_MS);
      search.type('a');
      search.type('qu');
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_PAUSE_MS);
      expect(sent).toEqual(['qu']);
      search.type('queen');
      search.now();
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_PAUSE_MS);
      expect(sent).toEqual(['qu']);
      search.dispose();

      const pending = withDeadline(new Promise(() => undefined), 40, SEARCH_SLOW);
      const failed = expect(pending).rejects.toThrow(SEARCH_SLOW);
      await vi.advanceTimersByTimeAsync(40);
      await failed;
      await expect(withDeadline(Promise.resolve('park'), 40, SEARCH_SLOW)).resolves.toBe('park');
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns a map pixel back into the place under it', () => {
    const centre = viewToPoint({ centre: start, zoom: 14, width: 200, height: 200, x: 100, y: 100 });
    expect(centre?.latitude).toBeCloseTo(start.latitude, 4);
    expect(centre?.longitude).toBeCloseTo(start.longitude, 4);
    const east = viewToPoint({ centre: start, zoom: 14, width: 200, height: 200, x: 150, y: 100 });
    expect(east && centre && east.longitude).toBeGreaterThan(centre?.longitude ?? 0);
    expect(viewToPoint({ centre: start, zoom: 14, width: 0, height: 200, x: 10, y: 10 })).toBeNull();
  });
});
