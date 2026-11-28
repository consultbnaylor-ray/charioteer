import type { MapScheme } from '@/domain/outdoorRoute';

/**
 * OpenFreeMap draws footpaths as a thin white dash, which disappears on the pale green parks.
 * These overlays paint path, footway, track, bridleway, cycleway, and steps darker and thicker,
 * with a light casing on the light map so the dash reads on green.
 * Streams stay on the map, quieter than the paths.
 *
 * OpenMapTiles 3.16 (the OpenFreeMap planet tiles) does not put ordinary footways in the
 * transportation layer below zoom 14. Zoom 12 and 13 include highway=path and highway=track
 * only when the way is named or part of a hiking route. Zoom 11 and below include neither.
 * The overlay therefore starts at 12, where the first of those ways exist, and stays on
 * through zoom 22 while the map overzooms the zoom-14 tiles. The width stops run across
 * that whole range so the dash never falls through a gap or shrinks to nothing.
 */

export const FOOTPATH_CASING_ID = 'charioteer-path-casing';
export const FOOTPATH_STROKE_ID = 'charioteer-path-stroke';

/** First zoom at which the tiles contain any path or track. */
export const FOOTPATH_MIN_ZOOM = 12;
/**
 * Layer maxzoom is exclusive. 24 keeps the dash visible at zoom 22, the top of the map.
 */
export const FOOTPATH_MAX_ZOOM = 24;

/** highway=path|footway|track|bridleway|cycleway|steps, including the OpenMapTiles class values. */
export const FOOTPATH_FILTER = [
  'all',
  ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
  ['any',
    ['match', ['get', 'class'], ['path', 'track', 'pedestrian'], true, false],
    ['match', ['get', 'subclass'], ['path', 'footway', 'track', 'bridleway', 'cycleway', 'steps', 'pedestrian'], true, false],
  ],
] as const;

/** At least 1 px from zoom 12, then a stop at every zoom through 22. No stop is 0. */
export const FOOTPATH_STROKE_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  12, 1,
  13, 1.35,
  14, 1.75,
  15, 2.2,
  16, 2.7,
  17, 3.25,
  18, 3.85,
  19, 4.5,
  20, 5.2,
  21, 5.9,
  22, 6.6,
] as const;

export const FOOTPATH_CASING_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  12, 2.8,
  13, 3.2,
  14, 3.6,
  15, 4,
  16, 4.5,
  17, 5.1,
  18, 5.7,
  19, 6.3,
  20, 7,
  21, 7.7,
  22, 8.4,
] as const;

/** Solid across the same zooms. A stop of 0 would hide the dash. */
export const FOOTPATH_LINE_OPACITY = ['interpolate', ['linear'], ['zoom'], 12, 1, 22, 1] as const;

/**
 * The number a zoom expression evaluates to.
 * Outside the stops the nearest stop is used, which is how MapLibre clamps interpolate.
 */
export function zoomExpressionAt(expression: unknown, zoom: number): number {
  if (typeof expression === 'number' && Number.isFinite(expression)) return expression;
  if (!Array.isArray(expression) || expression[0] !== 'interpolate') return Number.NaN;
  const input = expression[2];
  const zoomInput = input === 'zoom' || (Array.isArray(input) && input[0] === 'zoom');
  if (!zoomInput || !Number.isFinite(zoom)) return Number.NaN;
  const stops: { at: number; value: number }[] = [];
  for (let index = 3; index + 1 < expression.length; index += 2) {
    const at = Number(expression[index]);
    const value = Number(expression[index + 1]);
    if (!Number.isFinite(at) || !Number.isFinite(value)) return Number.NaN;
    stops.push({ at, value });
  }
  if (stops.length === 0) return Number.NaN;
  if (zoom <= stops[0].at) return stops[0].value;
  const last = stops[stops.length - 1];
  if (!last || zoom >= last.at) return last?.value ?? Number.NaN;
  for (let index = 1; index < stops.length; index += 1) {
    const right = stops[index];
    const left = stops[index - 1];
    if (!right || !left || zoom > right.at) continue;
    const span = right.at - left.at;
    if (span <= 0) return right.value;
    const t = (zoom - left.at) / span;
    return left.value + (right.value - left.value) * t;
  }
  return last.value;
}

export function footpathPaint(scheme: MapScheme): { casing: Record<string, unknown>; stroke: Record<string, unknown> } {
  const light = scheme !== 'dark';
  return {
    casing: {
      'line-color': light ? '#F7F3EA' : '#5C4A32',
      'line-width': [...FOOTPATH_CASING_WIDTH],
      'line-opacity': [...FOOTPATH_LINE_OPACITY],
    },
    stroke: {
      'line-color': light ? '#4A3728' : '#F0D7A8',
      'line-width': [...FOOTPATH_STROKE_WIDTH],
      'line-dasharray': [1.6, 1.15],
      'line-opacity': [...FOOTPATH_LINE_OPACITY],
    },
  };
}

type StyleLayer = {
  id?: string;
  type?: string;
  source?: string;
  'source-layer'?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

function isLayer(value: unknown): value is StyleLayer {
  return Boolean(value) && typeof value === 'object';
}

/** Streams stay visible. On the light map they sit back so the darker paths lead. On the dark map they are no longer the same colour as the ground. */
function quietStream(layer: StyleLayer, scheme: MapScheme): StyleLayer {
  if (layer.type !== 'line' || layer['source-layer'] !== 'waterway') return layer;
  const paint = { ...(layer.paint ?? {}) };
  if (scheme === 'dark') {
    return {
      ...layer,
      paint: {
        ...paint,
        'line-color': '#8FB4D4',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 15, 1.1, 18, 1.8],
        'line-opacity': 0.8,
      },
    };
  }
  if (layer.id !== 'waterway_other') return layer;
  return { ...layer, paint: { ...paint, 'line-opacity': 0.75 } };
}

function transportSource(layers: readonly StyleLayer[]): string {
  const found = layers.find((layer) => layer.type === 'line' && layer['source-layer'] === 'transportation' && layer.source);
  return found?.source ?? 'openmaptiles';
}

/** Returns the style with path overlays inserted under the labels. A style that is not a MapLibre document is returned unchanged. */
export function emphasizeFootpaths(style: unknown, scheme: MapScheme): unknown {
  if (!style || typeof style !== 'object' || !Array.isArray((style as { layers?: unknown }).layers)) return style;
  const document = style as { layers: unknown[] };
  const layers = document.layers.filter(isLayer).filter((layer) => layer.id !== FOOTPATH_CASING_ID && layer.id !== FOOTPATH_STROKE_ID).map((layer) => quietStream(layer, scheme));
  const paint = footpathPaint(scheme);
  const source = transportSource(layers);
  const casing: StyleLayer = {
    id: FOOTPATH_CASING_ID,
    type: 'line',
    source,
    'source-layer': 'transportation',
    minzoom: FOOTPATH_MIN_ZOOM,
    maxzoom: FOOTPATH_MAX_ZOOM,
    filter: FOOTPATH_FILTER,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: paint.casing,
  };
  const stroke: StyleLayer = {
    id: FOOTPATH_STROKE_ID,
    type: 'line',
    source,
    'source-layer': 'transportation',
    minzoom: FOOTPATH_MIN_ZOOM,
    maxzoom: FOOTPATH_MAX_ZOOM,
    filter: FOOTPATH_FILTER,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: paint.stroke,
  };
  const symbolAt = layers.findIndex((layer) => layer.type === 'symbol');
  const at = symbolAt < 0 ? layers.length : symbolAt;
  const next = [...layers.slice(0, at), casing, stroke, ...layers.slice(at)];
  return { ...document, layers: next };
}

/** Fetches one OpenFreeMap style and emphasizes the paths. A failed fetch leaves the style URL in place. */
export async function loadEmphasizedFootpathStyle(url: string, scheme: MapScheme): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    return emphasizeFootpaths(await response.json(), scheme);
  } catch {
    return url;
  }
}
