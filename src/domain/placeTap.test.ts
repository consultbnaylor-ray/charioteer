import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseRoutePlaces } from '@/domain/findRoute';

describe('suggested place tap', () => {
  it('reads a named search row and a geocode feature with longitude first', () => {
    expect(parseRoutePlaces({
      ok: true,
      places: [{ id: 'hyde', name: 'Hyde Park', latitude: 51.507, longitude: -0.165 }],
    })).toEqual([{ id: 'hyde', name: 'Hyde Park', latitude: 51.507, longitude: -0.165 }]);

    const feature = parseRoutePlaces({
      features: [{
        geometry: { coordinates: [-2.25, 53.53] },
        properties: { label: 'Heaton Park', gid: 'pelias:heaton' },
      }],
    });
    expect(feature).toEqual([{
      id: 'pelias:heaton',
      name: 'Heaton Park',
      latitude: 53.53,
      longitude: -2.25,
    }]);
    expect(feature[0]?.latitude).not.toBe(-2.25);

    expect(parseRoutePlaces({
      features: [{
        properties: { name: 'Bute Park', lat: 51.48, lon: -3.18 },
      }],
    })[0]).toMatchObject({ name: 'Bute Park', latitude: 51.48, longitude: -3.18 });

    expect(parseRoutePlaces({
      places: [],
      features: [{ geometry: { coordinates: [-2.25, 53.53] }, properties: { label: 'Ignored' } }],
    })).toEqual([]);
    expect(parseRoutePlaces({
      features: [{
        geometry: { coordinates: [[-2.25, 53.53], [-2.24, 53.54]] },
        properties: { label: 'A line' },
      }],
    })).toEqual([]);
    expect(parseRoutePlaces(null)).toEqual([]);
  });

  it('selects a search result on press-in and marks the chosen name', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const results = maker.slice(maker.indexOf('{results.map'), maker.indexOf("label={craving ? 'Make this walk'"));
    expect(results).toContain('selectOnPressIn');
    expect(results).toContain('pickResult(place)');
    expect(results).toContain("selected={(picking === 'end' ? endName : startName) === place.name}");
    expect(results).not.toContain('selected={false}');
    expect(maker.match(/selectOnPressIn/g)).toEqual(['selectOnPressIn']);

    const search = maker.slice(maker.indexOf('async function search'), maker.indexOf('async function make'));
    expect(search.indexOf('setResults(await repo.searchRoutePlaces(query))')).toBeGreaterThan(-1);
    expect(search.indexOf('setResults(await repo.searchRoutePlaces(query))')).toBeLessThan(search.indexOf('dismissKeyboard()'));
    expect(search).toContain("shownError(err, 'The place search did not answer.')");

    const ui = readFileSync('src/ui/ui.tsx', 'utf8');
    const choice = ui.slice(ui.indexOf('export function Choice'), ui.indexOf('export function ErrorNote'));
    const choose = choice.slice(choice.indexOf('const choose'), choice.indexOf('return ('));
    expect(choose.indexOf('onPress();')).toBeLessThan(choose.indexOf('dismissKeyboard();'));
    expect(choice).toContain('onPressIn={selectOnPressIn ? choose : undefined}');
  });
});
