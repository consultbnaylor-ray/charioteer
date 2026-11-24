import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DISTANCE_WINS_NOTE,
  ROUTE_DISTANCE_CHOICES,
  ROUTE_DISTANCE_MAX_M,
  ROUTE_DISTANCE_MIN_M,
  ROUTE_MINUTES_MAX,
  ROUTE_MINUTES_MIN,
  ROUTE_TIME_CHOICES,
  parseCustomRouteDistance,
  parseCustomRouteMinutes,
  plannedRouteFields,
  routeAskFromChoices,
  routeDistanceFieldHint,
  routeMinutesFieldHint,
  targetLengthM,
} from '@/domain/findRoute';
import {
  ROUTE_DISTANCE_MAX_M as SERVICE_DISTANCE_MAX_M,
  ROUTE_DISTANCE_MIN_M as SERVICE_DISTANCE_MIN_M,
  ROUTE_MINUTES_MAX as SERVICE_MINUTES_MAX,
  ROUTE_MINUTES_MIN as SERVICE_MINUTES_MIN,
  buildDirectionsBody,
  routeLengthM,
} from '../../supabase/functions/_shared/orsRoute';

const start = { latitude: 51.4504, longitude: -2.5945 };
const end = { latitude: 51.46, longitude: -2.6 };
const MILE_METRES = 1609.344;

describe('custom route distance and time', () => {
  it('uses the same window the route service clamps to', () => {
    expect(ROUTE_DISTANCE_MIN_M).toBe(500);
    expect(ROUTE_DISTANCE_MAX_M).toBe(50_000);
    expect(ROUTE_MINUTES_MIN).toBe(10);
    expect(ROUTE_MINUTES_MAX).toBe(180);
    expect(ROUTE_DISTANCE_MIN_M).toBe(SERVICE_DISTANCE_MIN_M);
    expect(ROUTE_DISTANCE_MAX_M).toBe(SERVICE_DISTANCE_MAX_M);
    expect(ROUTE_MINUTES_MIN).toBe(SERVICE_MINUTES_MIN);
    expect(ROUTE_MINUTES_MAX).toBe(SERVICE_MINUTES_MAX);
    expect(targetLengthM({ mode: 'walk', distanceM: 100_000 })).toBe(50_000);
    expect(targetLengthM({ mode: 'walk', distanceM: 100 })).toBe(500);
    expect(targetLengthM({ mode: 'walk', minutes: 5 })).toBe(800);
    expect(targetLengthM({ mode: 'walk', minutes: 600 })).toBe(14_400);
    expect(targetLengthM({ mode: 'cycle', minutes: 600 })).toBe(45_000);
    expect(targetLengthM({ mode: 'walk', distanceM: 12_500, minutes: 40 })).toBe(12_500);
    expect(routeLengthM({ mode: 'run', distanceM: 80_000 })).toBe(50_000);
    expect(routeLengthM({ mode: 'run', minutes: 5 })).toBe(1_500);
    expect(routeLengthM({ mode: 'cycle', distanceM: 10_000, minutes: 40 })).toBe(10_000);
    expect(routeLengthM({ mode: 'walk', distanceM: null, minutes: 15 })).toBe(1_200);
  });

  it('parses a custom distance in kilometres or miles and refuses a value outside the window', () => {
    expect(parseCustomRouteDistance('0.5', 'km')).toEqual({ ok: true, metres: 500 });
    expect(parseCustomRouteDistance('50', 'km')).toEqual({ ok: true, metres: 50_000 });
    expect(parseCustomRouteDistance('12.5', 'km')).toEqual({ ok: true, metres: 12_500 });
    expect(parseCustomRouteDistance(' 12,5 ', 'km')).toEqual({ ok: true, metres: 12_500 });
    expect(parseCustomRouteDistance('.5', 'km')).toEqual({ ok: true, metres: 500 });
    expect(parseCustomRouteDistance('6.5', 'mile')).toEqual({ ok: true, metres: Math.round(6.5 * MILE_METRES) });
    expect(parseCustomRouteDistance('3.1', 'mile')).toEqual({ ok: true, metres: Math.round(3.1 * MILE_METRES) });

    expect(parseCustomRouteDistance('', 'km')).toEqual({ ok: false, message: 'Enter a distance in kilometres.' });
    expect(parseCustomRouteDistance('six', 'km')).toEqual({ ok: false, message: 'Enter a distance in kilometres.' });
    expect(parseCustomRouteDistance('6.5 km', 'km')).toEqual({ ok: false, message: 'Enter a distance in kilometres.' });
    expect(parseCustomRouteDistance('', 'mile')).toEqual({ ok: false, message: 'Enter a distance in miles.' });
    expect(parseCustomRouteDistance('0.4', 'km')).toEqual({
      ok: false,
      message: 'Enter a distance between 0.5 and 50 km.',
    });
    expect(parseCustomRouteDistance('100', 'km')).toEqual({
      ok: false,
      message: 'Enter a distance between 0.5 and 50 km.',
    });
    expect(parseCustomRouteDistance('0.31', 'mile')).toEqual({
      ok: false,
      message: 'Enter a distance between 0.32 and 31.06 miles.',
    });
    expect(parseCustomRouteDistance('31.07', 'mile')).toEqual({
      ok: false,
      message: 'Enter a distance between 0.32 and 31.06 miles.',
    });
    expect(parseCustomRouteDistance('0.32', 'mile')).toEqual({ ok: true, metres: Math.round(0.32 * MILE_METRES) });
    expect(parseCustomRouteDistance('31.06', 'mile')).toEqual({ ok: true, metres: Math.round(31.06 * MILE_METRES) });
    expect(routeDistanceFieldHint('km')).toBe('Between 0.5 and 50 km.');
    expect(routeDistanceFieldHint('mile')).toBe('Between 0.32 and 31.06 miles.');
  });

  it('parses whole minutes and refuses a time the route service will not use', () => {
    expect(parseCustomRouteMinutes('10')).toEqual({ ok: true, minutes: 10 });
    expect(parseCustomRouteMinutes('180')).toEqual({ ok: true, minutes: 180 });
    expect(parseCustomRouteMinutes(' 75 ')).toEqual({ ok: true, minutes: 75 });
    expect(parseCustomRouteMinutes('')).toEqual({ ok: false, message: 'Enter a whole number of minutes.' });
    expect(parseCustomRouteMinutes('45.5')).toEqual({ ok: false, message: 'Enter a whole number of minutes.' });
    expect(parseCustomRouteMinutes('20 min')).toEqual({ ok: false, message: 'Enter a whole number of minutes.' });
    expect(parseCustomRouteMinutes('5')).toEqual({
      ok: false,
      message: 'Enter a time between 10 and 180 minutes.',
    });
    expect(parseCustomRouteMinutes('600')).toEqual({
      ok: false,
      message: 'Enter a time between 10 and 180 minutes.',
    });
    expect(routeMinutesFieldHint()).toBe('Between 10 and 180 minutes.');
  });

  it('sends the custom distance or the time-converted length for a loop and for A to B', () => {
    expect(ROUTE_DISTANCE_CHOICES.map((item) => item.label)).toEqual(['3 km', '5 km', '8 km', 'Use time', 'Custom']);
    expect(ROUTE_TIME_CHOICES.map((item) => item.label)).toEqual(['No set time', '30 min', '45 min', '60 min', 'Custom']);
    expect(DISTANCE_WINS_NOTE).toBe(
      'When both distance and time are set, the distance is used. A time on its own is turned into a distance.',
    );

    const distance = routeAskFromChoices({
      mode: 'walk',
      distanceChoice: 'custom',
      timeChoice: 'none',
      customDistance: '12.5',
      customMinutes: '',
      unit: 'km',
    });
    expect(distance).toEqual({ ok: true, distanceM: 12_500, minutes: null, lengthM: 12_500 });
    if (!distance.ok) return;

    const timed = routeAskFromChoices({
      mode: 'run',
      distanceChoice: 'time',
      timeChoice: 'custom',
      customDistance: '',
      customMinutes: '40',
      unit: 'km',
    });
    expect(timed).toEqual({ ok: true, distanceM: null, minutes: 40, lengthM: 6_000 });

    const cycle = routeAskFromChoices({
      mode: 'cycle',
      distanceChoice: 'time',
      timeChoice: 'custom',
      customDistance: '',
      customMinutes: '40',
      unit: 'mile',
    });
    expect(cycle).toEqual({ ok: true, distanceM: null, minutes: 40, lengthM: 10_000 });

    const both = routeAskFromChoices({
      mode: 'walk',
      distanceChoice: 'custom',
      timeChoice: 'custom',
      customDistance: '8',
      customMinutes: '40',
      unit: 'km',
    });
    expect(both).toEqual({ ok: true, distanceM: 8_000, minutes: 40, lengthM: 8_000 });

    const miles = routeAskFromChoices({
      mode: 'walk',
      distanceChoice: 'custom',
      timeChoice: 'none',
      customDistance: '3.1',
      customMinutes: '90',
      unit: 'mile',
    });
    const mileMetres = Math.round(3.1 * MILE_METRES);
    expect(miles).toEqual({ ok: true, distanceM: mileMetres, minutes: null, lengthM: mileMetres });

    const preset = routeAskFromChoices({
      mode: 'walk',
      distanceChoice: '5',
      timeChoice: '30',
      customDistance: '99',
      customMinutes: '99',
      unit: 'km',
    });
    expect(preset).toEqual({ ok: true, distanceM: 5_000, minutes: 30, lengthM: 5_000 });

    for (const shape of ['loop', 'a_to_b'] as const) {
      expect(plannedRouteFields({
        mode: 'walk',
        shape,
        distanceM: distance.distanceM,
        minutes: distance.minutes,
      })).toEqual({ mode: 'walk', shape, distanceM: 12_500, minutes: null, lengthM: 12_500 });
      expect(plannedRouteFields({
        mode: 'run',
        shape,
        distanceM: null,
        minutes: 40,
      })).toEqual({ mode: 'run', shape, distanceM: null, minutes: 40, lengthM: 6_000 });
      expect(routeLengthM({ mode: 'run', distanceM: null, minutes: 40 })).toBe(6_000);
    }

    const loop = buildDirectionsBody({ mode: 'walk', shape: 'loop', start, lengthM: distance.lengthM });
    expect(loop?.options).toEqual({ round_trip: { length: 12_500, points: 5 } });
    const across = buildDirectionsBody({ mode: 'walk', shape: 'a_to_b', start, end, lengthM: distance.lengthM });
    expect(across?.coordinates).toEqual([[-2.5945, 51.4504], [-2.6, 51.46]]);
    expect(JSON.stringify(across)).not.toContain('round_trip');
    expect(routeLengthM({ mode: 'walk', distanceM: 12_500, minutes: null })).toBe(12_500);
  });

  it('refuses an unusable custom value and keeps a preset when custom text is blank', () => {
    expect(routeAskFromChoices({
      mode: 'walk',
      distanceChoice: 'custom',
      timeChoice: 'custom',
      customDistance: '100',
      customMinutes: '40',
      unit: 'km',
    })).toEqual({ ok: false, message: 'Enter a distance between 0.5 and 50 km.' });
    expect(routeAskFromChoices({
      mode: 'walk',
      distanceChoice: 'time',
      timeChoice: 'custom',
      customDistance: '',
      customMinutes: '5',
      unit: 'km',
    })).toEqual({ ok: false, message: 'Enter a time between 10 and 180 minutes.' });
    expect(routeAskFromChoices({
      mode: 'walk',
      distanceChoice: 'time',
      timeChoice: 'none',
      customDistance: '',
      customMinutes: '',
      unit: 'km',
    })).toEqual({ ok: false, message: 'Choose a distance or a time.' });
    expect(routeAskFromChoices({
      mode: 'walk',
      distanceChoice: '8',
      timeChoice: 'custom',
      customDistance: '',
      customMinutes: '   ',
      unit: 'km',
    })).toEqual({ ok: true, distanceM: 8_000, minutes: null, lengthM: 8_000 });
    expect(routeAskFromChoices({
      mode: 'walk',
      distanceChoice: '5',
      timeChoice: 'custom',
      customDistance: '',
      customMinutes: '4',
      unit: 'km',
    })).toEqual({ ok: false, message: 'Enter a time between 10 and 180 minutes.' });
  });

  it('opens a custom field for each group and asks with that value for both shapes', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const findRoute = readFileSync('src/domain/findRoute.ts', 'utf8');
    expect(maker).toContain('ROUTE_DISTANCE_CHOICES.map');
    expect(maker).toContain('ROUTE_TIME_CHOICES.map');
    expect(maker).toContain("distanceId === 'custom'");
    expect(maker).toContain("timeId === 'custom'");
    expect(maker).toContain('keyboardType="decimal-pad"');
    expect(maker).toContain('keyboardType="number-pad"');
    expect(maker).toContain('loadDistanceUnit');
    expect(maker).toContain('{DISTANCE_WINS_NOTE}');
    expect(maker).toContain('customSession');
    expect(maker).not.toContain('<TextInput');
    expect(findRoute).toContain("label: 'Custom'");
    expect(findRoute).toContain("label: '3 km'");
    expect(findRoute).toContain("label: 'Use time'");
    expect(findRoute).toContain("label: 'No set time'");

    const make = maker.slice(maker.indexOf('async function make'), maker.indexOf('async function save'));
    const redraw = maker.slice(maker.indexOf('sendRef.current = async'), maker.indexOf('function onMapTap'));
    expect(make).toContain('askedRoute()');
    expect(redraw).toContain('askedRoute()');
    expect(make).toContain('distanceM: asked.distanceM');
    expect(make).toContain('minutes: asked.minutes');
    expect(make).toContain("shape: craving ? 'loop' : shape");
    expect(redraw).toContain("shape: craving ? 'loop' : shape");
    expect(redraw).toContain('distanceM: through ? null : asked.distanceM');
    expect(redraw).toContain('minutes: through ? null : asked.minutes');
    expect(maker).toContain('routeAskFromChoices');
    expect(maker).not.toMatch(/latitude|longitude/);
  });

  it('keeps how, shape, and distance collapsed, with the current choice in the header', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const group = readFileSync('src/ui/RouteChoiceGroup.tsx', 'utf8');
    expect(group).toContain('useState(false)');
    expect(group).toContain('<ExpandableRow');
    expect(group).toContain('expanded={open}');
    expect(group).toContain('`${title} · ${choice}`');
    expect(maker).toContain("title={modeTouched ? 'How' : 'How (optional)'}");
    expect(maker).toContain("choice={modeTouched ? howChoice : 'Walk / Run / Cycle'}");
    expect(maker).toContain("title={shapeTouched ? 'Shape' : 'Shape (optional)'}");
    expect(maker).toContain("choice={shapeTouched ? shapeChoice : 'Loop or A to B'}");
    expect(maker).toContain('title="Distance (optional)"');
    expect(maker).toContain('choice={distanceChoice}');
    expect(maker).toContain('selected={modeTouched && mode === \'walk\'}');
    expect(maker).toContain('selected={shapeTouched && shape === \'loop\'}');
    const start = maker.slice(maker.indexOf('<T variant="label">Start</T>'), maker.indexOf('<T variant="label">Destination</T>'));
    expect(start.indexOf('label="Where I am"')).toBeLessThan(start.indexOf('>or</T>'));
    expect(start.indexOf('>or</T>')).toBeLessThan(start.indexOf('label="Search for a place"'));
    expect(start).toContain('selected={hereSelected}');
    const destination = maker.slice(maker.indexOf('<T variant="label">Destination</T>'), maker.indexOf('{PREFER_PATHS_LABEL}'));
    expect(destination.indexOf('label="Where I am"')).toBeLessThan(destination.indexOf('>or</T>'));
    expect(destination.indexOf('>or</T>')).toBeLessThan(destination.indexOf('label="Search for a destination"'));
    expect(destination).toContain('selected={endHereSelected}');
    expect(destination).toContain('{BOTH_HERE_HINT}');
    expect(destination).toContain("void whereIAm('end')");
    expect(maker).toContain("shapeTouched && shape === 'a_to_b'");
    expect(maker).not.toContain('STARTER_PLACES');
    expect(maker).not.toContain('STARTER_NOTE');
    expect(maker).not.toContain('No start yet.');
    expect(maker).not.toContain('No destination yet.');
    expect(maker).not.toContain('Bristol, Queen Square');
    expect(maker).not.toContain('London, Hyde Park');
    const distance = maker.slice(maker.indexOf('title="Distance (optional)"'), maker.indexOf('<T variant="label">Start</T>'));
    expect(distance).toContain('{DISTANCE_WINS_NOTE}');
    expect(distance).toContain('ROUTE_TIME_CHOICES.map');
    expect(distance).toContain("distanceId === 'custom'");
    expect(maker.indexOf('DRAW_PEN_HINT')).toBeLessThan(maker.indexOf('<FootpathMap'));
    expect(maker).toContain('statsToneColors(theme.scheme).good.ink');
  });
});
