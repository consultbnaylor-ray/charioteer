import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { STARTER_PLACES, DIRECTIONS_TO_START, DIRECTIONS_TO_START_NOTE, directionsToStartUrl } from '@/domain/findRoute';

describe('directions to the start', () => {
  it('builds a walking Apple Maps link in latitude, longitude order and does not read a location', () => {
    const place = STARTER_PLACES[0];
    const url = directionsToStartUrl(place);
    const pair = `${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`;
    expect(url).toBe(`https://maps.apple.com/?daddr=${encodeURIComponent(pair)}&dirflg=w`);
    expect(url).not.toContain('saddr');
    const decoded = decodeURIComponent(url ?? '');
    const match = decoded.match(/daddr=(-?\d+\.\d+),(-?\d+\.\d+)/);
    expect(match?.[1]).toBe(place.latitude.toFixed(5));
    expect(match?.[2]).toBe(place.longitude.toFixed(5));
    expect(Number(match?.[1])).toBeGreaterThan(0);
    expect(Number(match?.[2])).toBeLessThan(0);
    const end = { latitude: place.latitude + 0.02, longitude: place.longitude + 0.02 };
    const toEnd = directionsToStartUrl(end);
    expect(toEnd).not.toBe(url);
    expect(decodeURIComponent(toEnd ?? '')).toContain(end.latitude.toFixed(5));
    expect(directionsToStartUrl(null)).toBeNull();
    expect(directionsToStartUrl(undefined)).toBeNull();
    expect(directionsToStartUrl({ latitude: Number.NaN, longitude: 1 })).toBeNull();
    expect(directionsToStartUrl({ latitude: 0, longitude: 0 })).toBeNull();
    expect(directionsToStartUrl({ latitude: 91, longitude: 1 })).toBeNull();

    const source = readFileSync('src/domain/findRoute.ts', 'utf8');
    const fn = source.slice(source.indexOf('export function directionsToStartUrl'), source.indexOf('export function appleMapsUrl'));
    expect(fn).toContain('encodeURIComponent');
    expect(fn).toContain('dirflg=w');
    expect(fn).not.toContain('saddr');
    expect(fn).not.toMatch(/console\.|fetch\(|client_errors|getCurrentPosition|watchPosition|supabase/);
    expect(JSON.stringify(DIRECTIONS_TO_START)).not.toMatch(/postcode/i);
    expect(JSON.stringify(DIRECTIONS_TO_START_NOTE)).not.toMatch(/postcode/i);

    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).toContain('directionsToStartUrl(plan.snappedStart ?? plan.points[0] ?? null)');
    expect(maker).toContain('label="Open in Apple Maps"');
    expect(maker).toContain('Linking.openURL(startUrl).catch(() => undefined)');
    expect(maker).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*startUrl/);
    const saved = readFileSync('src/app/(main)/saved-route.tsx', 'utf8');
    expect(saved).toContain('directionsToStartUrl(route.points[0])');
    expect(saved).toContain('Linking.openURL(startUrl).catch(() => undefined)');
    expect(saved).not.toMatch(/console\.(log|info|debug|warn|error)/);
    const press = saved.slice(saved.indexOf('{startUrl ?'), saved.indexOf('<FootpathMap'));
    expect(press).toContain('DIRECTIONS_TO_START');
    expect(press).not.toContain('readWhileUsingFix');
    expect(readFileSync('app.json', 'utf8')).not.toContain('NSLocationAlways');
  });
});
