import type { ActivityKind } from '@/domain/activitySession';
import type { OutdoorPoint, OutdoorRoute } from '@/domain/outdoorRoute';

/** A route just made, held on this phone until the outing screen takes it. */
export type MadeRouteGuide = {
  title: string;
  kind: ActivityKind;
  points: OutdoorPoint[];
};

let waiting: MadeRouteGuide | null = null;
let shown: { token: string; guide: MadeRouteGuide } | null = null;

function cloneGuide(guide: MadeRouteGuide): MadeRouteGuide {
  return {
    title: guide.title.trim().slice(0, 80) || 'My route',
    kind: guide.kind,
    points: guide.points.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
  };
}

/** The line the outing will draw. Empty and one-point lines are not a route. */
export function copyMadeRoute(guide: MadeRouteGuide | null): MadeRouteGuide | null {
  if (!guide || guide.points.length < 2) return null;
  return cloneGuide(guide);
}

export function holdMadeRoute(guide: MadeRouteGuide): void {
  waiting = cloneGuide(guide);
}

/**
 * Hands the waiting line to the outing screen.
 * The same token can be read again if that screen remounts.
 * A later route replaces it.
 */
export function takeMadeRoute(token: string): MadeRouteGuide | null {
  if (shown?.token === token) return copyMadeRoute(shown.guide);
  const next = copyMadeRoute(waiting);
  waiting = null;
  shown = next ? { token, guide: next } : null;
  return copyMadeRoute(next);
}

export function clearMadeRoute(token?: string): void {
  waiting = null;
  if (!token || shown?.token === token) shown = null;
}

export function guideAsRoutes(guide: MadeRouteGuide | null): OutdoorRoute[] {
  const copied = copyMadeRoute(guide);
  if (!copied) return [];
  return [{
    id: 'made-route-guide',
    title: copied.title,
    kind: 'drawn',
    distanceM: 0,
    durationMinutes: 0,
    points: copied.points,
    createdAt: '',
  }];
}

export function madeRouteToken(value: string | string[] | undefined): string | null {
  const token = Array.isArray(value) ? value[0] : value;
  if (!token || token.trim().length === 0) return null;
  return token.trim().slice(0, 40);
}

export function resetMadeRouteGuide(): void {
  waiting = null;
  shown = null;
}
