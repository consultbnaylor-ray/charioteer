import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  LOCATION_FIX_MESSAGE,
  LOCATION_FIX_PENDING,
  LOCATION_FIX_TIMEOUT_MS,
  readWhileUsingFix,
  type WhileUsingDeps,
} from '@/location/whileUsing';

function deps(partial: Partial<WhileUsingDeps> & Pick<WhileUsingDeps, 'getCurrentPositionAsync'>): WhileUsingDeps {
  return {
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    ...partial,
  };
}

describe('while-using location', () => {
  it('returns a fix when location is already allowed', async () => {
    let asked = 0;
    const result = await readWhileUsingFix(deps({
      requestForegroundPermissionsAsync: async () => {
        asked += 1;
        return { status: 'granted' };
      },
      getCurrentPositionAsync: async () => ({ coords: { latitude: 51.45, longitude: -2.59 } }),
    }));
    expect(result).toEqual({ ok: true, point: { latitude: 51.45, longitude: -2.59 } });
    expect(asked).toBe(0);
  });

  it('asks once when permission is not granted yet, then reads the fix', async () => {
    let asked = 0;
    const result = await readWhileUsingFix(deps({
      getForegroundPermissionsAsync: async () => ({ status: 'undetermined' }),
      requestForegroundPermissionsAsync: async () => {
        asked += 1;
        return { status: 'granted' };
      },
      getCurrentPositionAsync: async () => ({ coords: { latitude: 53.48, longitude: -2.24 } }),
    }));
    expect(asked).toBe(1);
    expect(result.ok).toBe(true);
  });

  it('reports denied without reading a position, and the screen can say so', async () => {
    let read = 0;
    const result = await readWhileUsingFix(deps({
      getForegroundPermissionsAsync: async () => ({ status: 'denied' }),
      requestForegroundPermissionsAsync: async () => ({ status: 'denied' }),
      getCurrentPositionAsync: async () => {
        read += 1;
        return { coords: { latitude: 1, longitude: 2 } };
      },
    }));
    expect(result).toEqual({ ok: false, reason: 'denied' });
    expect(read).toBe(0);
    expect(LOCATION_FIX_MESSAGE).toBe(
      "Couldn't get your location. Check Settings > Privacy > Location Services > Charioteer, or pick a start below.",
    );
  });

  it('reports unavailable when the position call fails or the numbers are not a place', async () => {
    const failed = await readWhileUsingFix(deps({
      getCurrentPositionAsync: async () => {
        throw new Error('services off');
      },
    }));
    expect(failed).toEqual({ ok: false, reason: 'unavailable' });
    const blank = await readWhileUsingFix(deps({
      getCurrentPositionAsync: async () => ({ coords: { latitude: Number.NaN, longitude: 0 } }),
    }));
    expect(blank).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('stops waiting when the fix does not arrive', async () => {
    const started = Date.now();
    const result = await readWhileUsingFix(deps({
      getCurrentPositionAsync: () => new Promise(() => {}),
    }), 20);
    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(500);
    expect(LOCATION_FIX_TIMEOUT_MS).toBe(12_000);
  });

  it('shows loading, then a selected Where I am, and keeps the failure on screen', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const map = readFileSync('src/app/(main)/outside-map.tsx', 'utf8');
    for (const source of [maker, map]) {
      expect(source).toContain('LOCATION_FIX_MESSAGE');
      expect(source).toContain('pendingLabel={LOCATION_FIX_PENDING}');
      expect(source).toContain("label=\"Where I am\"");
      expect(source).not.toContain('Location stays off until you allow it');
    }
    expect(maker).toContain('selected={hereSelected}');
    expect(maker).toContain("startName === 'Where I am' && start != null");
    expect(maker).toContain('disabled={pending || locating}');
    expect(map).toContain('selected={here != null}');
    expect(LOCATION_FIX_PENDING).toBe('Finding where you are');
    const reader = readFileSync('src/location/whileUsing.ts', 'utf8');
    expect(reader).toContain('requestForegroundPermissionsAsync');
    expect(reader).toContain('getCurrentPositionAsync');
    expect(reader).not.toMatch(/requestBackground|startLocationUpdates|watchPosition|NSLocationAlways|ACCESS_BACKGROUND_LOCATION/);
  });

  it('drops a stale, empty, or invalid fix and recentres without asking for a route', async () => {
    const stale = await readWhileUsingFix(deps({
      getCurrentPositionAsync: async () => ({
        coords: { latitude: 51.45, longitude: -2.59, accuracy: 5 },
        timestamp: Date.now() - 130_000,
      }),
    }));
    expect(stale).toEqual({ ok: false, reason: 'unavailable' });
    const negative = await readWhileUsingFix(deps({
      getCurrentPositionAsync: async () => ({
        coords: { latitude: 51.45, longitude: -2.59, accuracy: -1 },
        timestamp: Date.now(),
      }),
    }));
    expect(negative).toEqual({ ok: false, reason: 'unavailable' });
    const zero = await readWhileUsingFix(deps({
      getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0 } }),
    }));
    expect(zero).toEqual({ ok: false, reason: 'unavailable' });
    const swapped = await readWhileUsingFix(deps({
      getCurrentPositionAsync: async () => ({ coords: [-2.59, 51.45] as never }),
    }));
    expect(swapped).toEqual({ ok: false, reason: 'unavailable' });
    const fresh = await readWhileUsingFix(deps({
      getCurrentPositionAsync: async () => ({
        coords: { latitude: 51.450412349, longitude: -2.594512349, accuracy: 12 },
        accuracy: { horizontalAccuracy: 12 },
        timestamp: Date.now() - 5_000,
      }),
    }));
    expect(fresh).toEqual({ ok: true, point: { latitude: 51.450412, longitude: -2.594512 } });
    const reader = readFileSync('src/location/whileUsing.ts', 'utf8');
    expect(reader).toContain('maximumAge: 0');
    expect(reader).toContain('Location.Accuracy.High');
    expect(reader).not.toContain('getLastKnownPositionAsync');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const show = maker.slice(maker.indexOf('async function showMyLocation'), maker.indexOf('async function search'));
    expect(show).toContain('readWhileUsingFix');
    expect(show).toContain('setYou(fix.point)');
    expect(show).not.toContain('planOutdoorRoute');
    expect(show).not.toContain('setStart');
    expect(maker).toContain('here={you}');
    expect(maker).not.toContain('here={plan.points[0]');
    const map = readFileSync('src/app/(main)/outside-map.tsx', 'utf8');
    expect(map).toContain('onShowMyLocation={() => { void whereIAm(); }}');
    expect(map).not.toContain('planOutdoorRoute');
    for (const path of ['src/ui/FootpathMap.tsx', 'src/ui/FootpathMap.web.tsx']) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('youAreHereCollection');
      expect(source).toContain('startCollection');
      expect(source).toContain('YOU_HERE_FILL');
      expect(source).toContain('<ShowMyLocationButton');
      expect(source).not.toContain('planOutdoorRoute');
      expect(source).not.toContain('trackUserLocation');
      expect(source).not.toContain('watchPosition');
    }
    const button = readFileSync('src/ui/ShowMyLocation.tsx', 'utf8');
    expect(button).toContain("accessibilityLabel={SHOW_MY_LOCATION}");
    expect(button).toContain("export const SHOW_MY_LOCATION = 'Show my location'");
    expect(button).toContain('width: 44');
    expect(button).not.toContain('planOutdoorRoute');
  });
});
