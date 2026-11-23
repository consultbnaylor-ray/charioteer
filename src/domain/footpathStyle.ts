import type { MapScheme } from '@/domain/outdoorRoute';

/**
 * OpenFreeMap draws footpaths as a thin white dash, which disappears on the pale green parks.
 * These overlays paint path, footway, track, bridleway, cycleway, and steps darker and thicker,
 * with a light casing on the light map so the dash reads on green.
 * Streams stay on the map, quieter than the paths.
 */

export const FOOTPATH_CASING_ID = 'charioteer-path-casing';
export const FOOTPATH_STROKE_ID = 'charioteer-path-stroke';

/** highway=path|footway|track|bridleway|cycleway|steps, including the OpenMapTiles class values. */
export const FOOTPATH_FILTER = [
  'all',
  ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
  ['any',
    ['match', ['get', 'class'], ['path', 'track'], true, false],
    ['match', ['get', 'subclass'], ['path', 'footway', 'track', 'bridleway', 'cycleway', 'steps'], true, false],
  ],
] as const;

const STROKE_WIDTH = ['interpolate', ['linear'], ['zoom'], 12, 1, 14, 2.2, 16, 3, 18, 4.2] as const;
const CASING_WIDTH = ['interpolate', ['linear'], ['zoom'], 12, 2.6, 14, 4, 16, 5.2, 18, 6.6] as const;

export function footpathPaint(scheme: MapScheme): { casing: Record<string, unknown>; stroke: Record<string, unknown> } {
  const light = scheme !== 'dark';
  return {
    casing: {
      'line-color': light ? '#F7F3EA' : '#5C4A32',
      'line-width': [...CASING_WIDTH],
      'line-opacity': 1,
    },
    stroke: {
      'line-color': light ? '#4A3728' : '#F0D7A8',
      'line-width': [...STROKE_WIDTH],
      'line-dasharray': [1.6, 1.15],
      'line-opacity': 1,
    },
  };
}

type StyleLayer = {
  id?: string;
  type?: string;
  source?: string;
  'source-layer'?: string;
  filter?: unknown;
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
    filter: FOOTPATH_FILTER,
    paint: paint.casing,
  };
  const stroke: StyleLayer = {
    id: FOOTPATH_STROKE_ID,
    type: 'line',
    source,
    'source-layer': 'transportation',
    filter: FOOTPATH_FILTER,
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
