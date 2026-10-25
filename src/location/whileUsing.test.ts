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
});
