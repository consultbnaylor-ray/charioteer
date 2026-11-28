/**
 * The line kept on a saved route (outdoor_routes.geometry, own row only).
 * It is the snapped line, cut down and rounded. It is never logged.
 */
import { cleanPoints, simplifyLine, type OutdoorPoint } from './outdoorRoute';

/** Enough for a smooth 20 km line on a phone map. The check constraint allows up to 1000. */
export const SAVED_LINE_POINT_CAP = 500;
/** Five decimal places is about 1 m. */
const SAVED_LINE_DECIMALS = 5;


function rounded(value: number): number {
  const scale = 10 ** SAVED_LINE_DECIMALS;
  return Math.round(value * scale) / scale;
}

/** The geometry value to store, or null when there is no line worth keeping. */
export function savedLineGeometry(points: readonly OutdoorPoint[]): OutdoorPoint[] | null {
  const line = simplifyLine(cleanPoints(points), SAVED_LINE_POINT_CAP)
    .map((point) => ({ latitude: rounded(point.latitude), longitude: rounded(point.longitude) }));
  const kept: OutdoorPoint[] = [];
  for (const point of line) {
    const prev = kept[kept.length - 1];
    if (prev && prev.latitude === point.latitude && prev.longitude === point.longitude) continue;
    kept.push(point);
  }
  return kept.length >= 2 ? kept : null;
}

/** Adds the line to an insert or update row. A row with no line is left as it is. */
export function withSavedLine(row: Record<string, unknown>, points: readonly OutdoorPoint[]): Record<string, unknown> {
  const geometry = savedLineGeometry(points);
  return geometry ? { ...row, geometry } : row;
}

export function withoutSavedLine(row: Record<string, unknown>): Record<string, unknown> {
  const { geometry: _line, ...rest } = row;
  return rest;
}

/**
 * The database refused the line, most likely because the geometry grant or check
 * from 20261127173856_outdoor_routes_keep_line.sql is not applied yet.
 * The route is then saved without the line, as before.
 */
export function savedLineRejected(message: string, row: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(row, 'geometry')) return false;
  return /geometry|permission denied|42501|outdoor_routes_geometry/i.test(message);
}

/** Whether the saved-route screen can draw a map. No line, no map. */
export function savedRouteHasLine(points: readonly OutdoorPoint[]): boolean {
  return points.length >= 2;
}
