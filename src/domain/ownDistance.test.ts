import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { mockRoute, targetLengthM } from '@/domain/findRoute';
import {
  OWN_CHOICE_LABEL,
  OWN_ENTRY_MAX_CHARS,
  OWN_HOURS_LABEL,
  OWN_KM_HINT,
  OWN_KM_LABEL,
  OWN_MINUTES_LABEL,
  OWN_NUMBER_HINT,
  OWN_TIME_HINT,
  ownTimeHint,
  parseOwnDuration,
  parseOwnKilometres,
} from '@/domain/ownDistance';
import { buildDirectionsBody, routeLengthM } from '../../supabase/functions/_shared/orsRoute';

const start = { latitude: 51.4504, longitude: -2.5945 };

describe('typed distance and time', () => {
  it('reads kilometres, including a comma, a unit, and a paste', () => {
    expect(parseOwnKilometres('12.5')).toBe(12_500);
    expect(parseOwnKilometres('12,5')).toBe(12_500);
    expect(parseOwnKilometres('  12,5 km  ')).toBe(12_500);
    expect(parseOwnKilometres('12.5km')).toBe(12_500);
    expect(parseOwnKilometres('1.234,5')).toBe(1_234_500);
    expect(parseOwnKilometres('1,234.5')).toBe(1_234_500);
    expect(parseOwnKilometres('300')).toBe(300_000);
    expect(parseOwnKilometres('50')).toBe(50_000);
    expect(parseOwnKilometres('100')).toBe(100_000);
    expect(parseOwnKilometres('999999999')).toBe(999_999_999_000);
    expect(parseOwnKilometres('0.0005')).toBe(1);
    expect(parseOwnKilometres('')).toBeNull();
    expect(parseOwnKilometres('0')).toBeNull();
    expect(parseOwnKilometres('0,0')).toBeNull();
    expect(parseOwnKilometres('-5')).toBeNull();
    expect(parseOwnKilometres('1e3')).toBeNull();
    expect(parseOwnKilometres('12.5.1')).toBeNull();
    expect(parseOwnKilometres('0.0004')).toBeNull();
    expect(parseOwnKilometres('9'.repeat(400))).toBeNull();
  });

  it('reads minutes, or hours and minutes, and does not cap them', () => {
    expect(parseOwnDuration('', '90')).toBe(90);
    expect(parseOwnDuration('', '90 min')).toBe(90);
    expect(parseOwnDuration('', '90,5')).toBe(91);
    expect(parseOwnDuration('', '90.5')).toBe(91);
    expect(parseOwnDuration('', '1:30')).toBe(90);
    expect(parseOwnDuration('', '1h 30')).toBe(90);
    expect(parseOwnDuration('', '1 h 30 m')).toBe(90);
    expect(parseOwnDuration('', '2 hours')).toBe(120);
    expect(parseOwnDuration('1', '30')).toBe(90);
    expect(parseOwnDuration('1', '')).toBe(60);
    expect(parseOwnDuration('1.5', '')).toBe(90);
    expect(parseOwnDuration('1,5', '')).toBe(90);
    expect(parseOwnDuration('', '300')).toBe(300);
    expect(parseOwnDuration('1000', '')).toBe(60_000);
    expect(parseOwnDuration('', '')).toBeNull();
    expect(parseOwnDuration('', '0')).toBeNull();
    expect(parseOwnDuration('0', '0')).toBeNull();
    expect(parseOwnDuration('', '-5')).toBeNull();
    expect(parseOwnDuration('', '1e3')).toBeNull();
    expect(parseOwnDuration('abc', '10')).toBeNull();
    expect(ownTimeHint('', '')).toBe(OWN_TIME_HINT);
    expect(ownTimeHint('', '12,5')).toBe(OWN_TIME_HINT);
    expect(ownTimeHint('abc', '')).toBe(OWN_NUMBER_HINT);
  });

  it('keeps a long typed length, and lets distance win over time', () => {
    expect(targetLengthM({ mode: 'walk', distanceM: 5000, minutes: 15 })).toBe(5000);
    expect(targetLengthM({ mode: 'walk', minutes: 15 })).toBe(1200);
    expect(targetLengthM({ mode: 'walk', distanceM: 12_500, minutes: 30 })).toBe(12_500);
    expect(targetLengthM({ mode: 'walk', distanceM: 50_000, minutes: 15 })).toBe(50_000);
    expect(targetLengthM({ mode: 'walk', distanceM: 100_000, minutes: 15 })).toBe(100_000);
    expect(targetLengthM({ mode: 'walk', distanceM: 300_000, minutes: 15 })).toBe(300_000);
    expect(targetLengthM({ mode: 'walk', minutes: 300 })).toBe(24_000);
    expect(targetLengthM({ mode: 'run', minutes: 300 })).toBe(45_000);
    expect(targetLengthM({ mode: 'cycle', minutes: 300 })).toBe(75_000);
    expect(targetLengthM({ mode: 'walk', minutes: 1 })).toBe(80);
    expect(targetLengthM({ mode: 'walk', distanceM: 0, minutes: 15 })).toBe(1200);
    expect(targetLengthM({ mode: 'walk', distanceM: Number.POSITIVE_INFINITY, minutes: 15 })).toBe(1200);
    expect(routeLengthM({ mode: 'walk', distanceM: null, minutes: 15 })).toBe(1200);
    expect(routeLengthM({ mode: 'walk', distanceM: 300_000, minutes: 15 })).toBe(300_000);
    expect(routeLengthM({ mode: 'walk', distanceM: '300000', minutes: 15 })).toBe(300_000);
    expect(routeLengthM({ mode: 'walk', distanceM: null, minutes: 300 })).toBe(24_000);
    expect(routeLengthM({ mode: 'walk', distanceM: 0, minutes: 15 })).toBe(1200);
    const sample = mockRoute({ mode: 'walk', shape: 'loop', start, distanceM: 300_000 });
    expect(sample?.distanceM).toBe(300_000);
    const brief = mockRoute({ mode: 'walk', shape: 'loop', start, minutes: 1 });
    expect(brief?.distanceM).toBe(80);
    expect(brief?.durationMinutes).toBe(1);
    for (const lengthM of [50_000, 100_000, 300_000]) {
      const loop = buildDirectionsBody({ mode: 'walk', shape: 'loop', start, lengthM });
      expect(loop?.options).toEqual({ round_trip: { length: lengthM, points: 5 } });
      const across = buildDirectionsBody({
        mode: 'walk',
        shape: 'a_to_b',
        start,
        end: { latitude: 51.456, longitude: -2.6 },
        lengthM,
      });
      expect(across?.options).toBeUndefined();
      expect(across?.coordinates).toEqual([[-2.5945, 51.4504], [-2.6, 51.456]]);
    }
  });

  it('shows the typed fields beside the presets and does not clamp in the length helpers', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const words = readFileSync('src/domain/ownDistance.ts', 'utf8');
    expect(words).toContain(`'${OWN_CHOICE_LABEL}'`);
    expect(words).toContain(`'${OWN_KM_LABEL}'`);
    expect(words).toContain(`'${OWN_KM_HINT}'`);
    expect(words).toContain(`'${OWN_HOURS_LABEL}'`);
    expect(words).toContain(`'${OWN_MINUTES_LABEL}'`);
    expect(words).toContain(`'${OWN_TIME_HINT}'`);
    expect(words).toContain(`'${OWN_NUMBER_HINT}'`);
    expect(maker.match(/id: 'own'/g)).toHaveLength(2);
    expect(maker).toContain('label={OWN_KM_LABEL}');
    expect(maker).toContain('label={OWN_HOURS_LABEL}');
    expect(maker).toContain('label={OWN_MINUTES_LABEL}');
    expect(maker).toContain('OWN_KM_HINT');
    expect(maker).toContain('OWN_NUMBER_HINT');
    expect(maker).toContain('maxLength={OWN_ENTRY_MAX_CHARS}');
    expect(OWN_ENTRY_MAX_CHARS).toBeGreaterThanOrEqual(String(300).length);
    const make = maker.slice(maker.indexOf('async function make'), maker.indexOf('async function save'));
    expect(make).toContain('askedRoute()');
    expect(make).toContain('Choose a distance or a time.');
    expect(make).not.toContain('setOwnKm');
    const client = readFileSync('src/domain/findRoute.ts', 'utf8');
    const target = client.slice(client.indexOf('export function targetLengthM'), client.indexOf('export function filterStarterPlaces'));
    expect(target).not.toContain('50_000');
    expect(target).not.toContain('180');
    const shared = readFileSync('supabase/functions/_shared/orsRoute.ts', 'utf8');
    const length = shared.slice(shared.indexOf('export function routeLengthM'), shared.indexOf('function positiveAmount'));
    expect(length).not.toContain('50_000');
    expect(length).not.toContain('180');
    expect(shared).toContain("code: 'too_long'");
  });
});
