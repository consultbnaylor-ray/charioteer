/**
 * Location stays on the owner's phone.
 * A shared profile, a buddy share, or a direct message may keep distance,
 * duration, and pace. It never keeps a coordinate, a path, or a start or end place.
 */

const COORD_PAIR = /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g;
const COORD_WORD = /\b(?:latitude|longitude|lat|lng|lon)\b\s*[:=]?\s*-?\d{1,3}(?:\.\d+)?/gi;
const START_END = /\b(?:start|end)\s+location\b\s*[:\-]?\s*[^.,\n]*/gi;
const LONE_COORD = /-?\d{1,3}\.\d{4,}/g;

function plainKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase();
}

function isLocationKey(key: string): boolean {
  const name = plainKey(key);
  return name === 'latitude' || name === 'lat'
    || name === 'longitude' || name === 'lng' || name === 'lon'
    || name === 'startlocation' || name === 'endlocation'
    || name === 'startlat' || name === 'startlng' || name === 'startlon'
    || name === 'endlat' || name === 'endlng' || name === 'endlon'
    || name === 'coordinates' || name === 'coordinate';
}

function isRouteKey(key: string): boolean {
  const name = plainKey(key);
  return name === 'route' || name === 'routes' || name === 'routepoints' || name === 'polyline';
}

function presentLocation(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value != null && typeof value === 'object';
}

function isCoordinatePair(node: unknown): boolean {
  if (!Array.isArray(node) || node.length !== 2) return false;
  const [lat, lng] = node;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  const precise = (value: number) => /\.\d{4,}/.test(String(value));
  return precise(lat) || precise(lng);
}

/** Drops coordinate pairs and start or end location phrases. Distance, duration, and pace stay. */
export function scrubSharedText(text: string): string {
  const next = text
    .replace(COORD_PAIR, '')
    .replace(COORD_WORD, '')
    .replace(START_END, '')
    .replace(LONE_COORD, '');
  if (next === text) return text;
  return next.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '');
}

function walkShared(node: unknown, seen: WeakSet<object>): unknown {
  if (typeof node === 'string') return scrubSharedText(node);
  if (typeof node !== 'object' || node === null) return node;
  if (isCoordinatePair(node)) return undefined;
  if (seen.has(node)) return undefined;
  seen.add(node);
  if (Array.isArray(node)) {
    return node.flatMap((item) => {
      const next = walkShared(item, seen);
      if (next === undefined) return [];
      if (typeof item === 'string' && typeof next === 'string' && !next.trim() && next !== item) return [];
      return [next];
    });
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    if (isLocationKey(key) || isRouteKey(key)) continue;
    const next = walkShared(child, seen);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

/** A copy of a shared profile, buddy share, or message with location removed. */
export function omitSharedLocation<T>(value: T): T {
  return walkShared(value, new WeakSet()) as T;
}

/** True when a value destined for the network carries a route coordinate or a place. */
export function payloadHasRouteCoordinates(value: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (isCoordinatePair(node)) return true;
    if (!node || typeof node !== 'object') return false;
    if (seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(walk);
    const record = node as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (isLocationKey(key) && presentLocation(child)) return true;
      if (isRouteKey(key) && presentLocation(child)) return true;
    }
    return Object.values(record).some(walk);
  };
  return walk(value);
}

export function rejectRouteCoordinates(value: unknown): void {
  if (payloadHasRouteCoordinates(value)) {
    throw new Error('Workout routes stay on this iPhone.');
  }
}
