import { describe, expect, it } from 'vitest';

import {
  FOOTPATH_CASING_ID,
  FOOTPATH_CASING_WIDTH,
  FOOTPATH_LINE_OPACITY,
  FOOTPATH_MAX_ZOOM,
  FOOTPATH_MIN_ZOOM,
  FOOTPATH_STROKE_ID,
  FOOTPATH_STROKE_WIDTH,
  emphasizeFootpaths,
  footpathPaint,
  zoomExpressionAt,
} from '@/domain/footpathStyle';

const liberty = {
  version: 8,
  sources: { openmaptiles: { type: 'vector' } },
  layers: [
    { id: 'waterway_river', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': '#a0c8f0', 'line-width': 2 } },
    { id: 'waterway_other', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': '#a0c8f0', 'line-width': 1 } },
    { id: 'road_path_pedestrian', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#ffffff', 'line-width': 1 } },
    { id: 'place_label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
  ],
};

const dark = {
  version: 8,
  layers: [
    { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': 'rgb(27, 27, 29)' } },
    { id: 'highway_path', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': 'rgb(27, 27, 29)' } },
    { id: 'highway_name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name' },
  ],
};

function layer(style: unknown, id: string): {
  paint?: Record<string, unknown>;
  filter?: unknown;
  type?: string;
  minzoom?: number;
  maxzoom?: number;
} {
  const layers = (style as { layers: { id: string; paint?: Record<string, unknown>; filter?: unknown; type?: string }[] }).layers;
  const found = layers.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe('footpath emphasis', () => {
  it('paints paths as a darker zoom-scaled dash with a light casing, and keeps streams', () => {
    const style = emphasizeFootpaths(liberty, 'light') as { layers: { id: string }[] };
    const ids = style.layers.map((item) => item.id);
    expect(ids.indexOf(FOOTPATH_CASING_ID)).toBeGreaterThan(ids.indexOf('road_path_pedestrian'));
    expect(ids.indexOf(FOOTPATH_STROKE_ID)).toBe(ids.indexOf(FOOTPATH_CASING_ID) + 1);
    expect(ids.indexOf(FOOTPATH_STROKE_ID)).toBeLessThan(ids.indexOf('place_label'));
    expect(ids.filter((id) => id === 'waterway_other' || id === 'waterway_river')).toEqual(['waterway_river', 'waterway_other']);

    const stroke = layer(style, FOOTPATH_STROKE_ID);
    const casing = layer(style, FOOTPATH_CASING_ID);
    expect(stroke.paint?.['line-color']).toBe('#4A3728');
    expect(stroke.paint?.['line-dasharray']).toEqual([1.6, 1.15]);
    expect(stroke.paint?.['line-width']).toEqual([...FOOTPATH_STROKE_WIDTH]);
    expect(stroke.minzoom).toBe(FOOTPATH_MIN_ZOOM);
    expect(stroke.maxzoom).toBe(FOOTPATH_MAX_ZOOM);
    expect(stroke.maxzoom ?? 0).toBeGreaterThan(22);
    expect(casing.paint?.['line-color']).toBe('#F7F3EA');
    expect(JSON.stringify(stroke.filter)).toContain('footway');
    expect(JSON.stringify(stroke.filter)).toContain('bridleway');
    expect(JSON.stringify(stroke.filter)).toContain('cycleway');
    expect(JSON.stringify(stroke.filter)).toContain('steps');
    expect(JSON.stringify(stroke.filter)).toContain('track');
    expect(JSON.stringify(stroke.filter)).toContain('path');

    expect(layer(style, 'waterway_river').paint?.['line-color']).toBe('#a0c8f0');
    expect(layer(style, 'waterway_other').paint?.['line-color']).toBe('#a0c8f0');
    expect(layer(style, 'waterway_other').paint?.['line-opacity']).toBe(0.75);
    expect(layer(style, 'road_path_pedestrian').paint?.['line-color']).toBe('#ffffff');

    const again = emphasizeFootpaths(style, 'light') as { layers: { id: string }[] };
    expect(again.layers.filter((item) => item.id === FOOTPATH_STROKE_ID)).toHaveLength(1);
  });

  it('uses a light dash and a dark casing on the dark map, without removing water', () => {
    const paint = footpathPaint('dark');
    expect(paint.stroke['line-color']).toBe('#F0D7A8');
    expect(paint.casing['line-color']).toBe('#5C4A32');
    const style = emphasizeFootpaths(dark, 'dark') as { layers: { id: string }[] };
    expect(style.layers.some((item) => item.id === 'waterway')).toBe(true);
    expect(layer(style, 'waterway').paint?.['line-color']).toBe('#8FB4D4');
    expect(layer(style, 'waterway').paint?.['line-opacity']).toBe(0.8);
    expect(layer(style, FOOTPATH_STROKE_ID).paint?.['line-color']).toBe('#F0D7A8');
    expect(emphasizeFootpaths(null, 'light')).toBeNull();
    expect(emphasizeFootpaths('liberty', 'dark')).toBe('liberty');
  });

  it('keeps path width and opacity above zero from zoom 12 through 22', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const paint = footpathPaint(scheme);
      const style = emphasizeFootpaths(scheme === 'dark' ? dark : liberty, scheme);
      for (const id of [FOOTPATH_STROKE_ID, FOOTPATH_CASING_ID]) {
        expect(layer(style, id).minzoom).toBe(12);
        expect(layer(style, id).maxzoom).toBeGreaterThan(22);
      }
      for (let zoom = 12; zoom <= 22; zoom += 0.5) {
        const stroke = zoomExpressionAt(paint.stroke['line-width'], zoom);
        const casing = zoomExpressionAt(paint.casing['line-width'], zoom);
        const strokeOpacity = zoomExpressionAt(paint.stroke['line-opacity'], zoom);
        const casingOpacity = zoomExpressionAt(paint.casing['line-opacity'], zoom);
        expect(stroke).toBeGreaterThan(0);
        expect(stroke).toBeGreaterThanOrEqual(0.8);
        expect(casing).toBeGreaterThanOrEqual(0.8);
        expect(casing).toBeGreaterThan(stroke);
        expect(strokeOpacity).toBeGreaterThan(0);
        expect(casingOpacity).toBeGreaterThan(0);
      }
    }
    const stops = FOOTPATH_STROKE_WIDTH.filter((_, index) => index >= 3 && index % 2 === 1);
    const widths = FOOTPATH_STROKE_WIDTH.filter((_, index) => index >= 3 && index % 2 === 0);
    expect(stops[0]).toBe(12);
    expect(stops[stops.length - 1]).toBe(22);
    for (let index = 1; index < stops.length; index += 1) {
      expect(Number(stops[index]) - Number(stops[index - 1])).toBe(1);
    }
    for (const width of widths) expect(Number(width)).toBeGreaterThanOrEqual(0.8);
    expect(zoomExpressionAt(FOOTPATH_LINE_OPACITY, 12)).toBeGreaterThan(0);
    expect(zoomExpressionAt(FOOTPATH_LINE_OPACITY, 22)).toBeGreaterThan(0);
    expect(zoomExpressionAt([...FOOTPATH_CASING_WIDTH], 17.5)).toBeGreaterThan(0.8);
  });
});
