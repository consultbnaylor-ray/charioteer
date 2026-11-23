import { describe, expect, it } from 'vitest';

import {
  clearDrawStrokes,
  combineDrawStrokes,
  commitDrawStroke,
  continuationEnd,
  drawEnd,
  joinStroke,
  stitchRoute,
  undoDrawStroke,
  visibleDrawLine,
} from '@/domain/drawStroke';
import type { OutdoorPoint } from '@/domain/outdoorRoute';

const a: OutdoorPoint = { latitude: 51.45, longitude: -2.59 };
const b: OutdoorPoint = { latitude: 51.452, longitude: -2.588 };
const c: OutdoorPoint = { latitude: 51.454, longitude: -2.586 };
const away: OutdoorPoint = { latitude: 51.453, longitude: -2.584 };
const snappedEnd: OutdoorPoint = { latitude: 51.4524, longitude: -2.5876 };

describe('draw strokes', () => {
  it('joins a new stroke to the current end even when the finger starts away from it', () => {
    expect(joinStroke(null, [a, b])).toEqual([a, b]);
    expect(joinStroke(b, [b, c])).toEqual([b, c]);
    expect(joinStroke(b, [away, c])).toEqual([b, away, c]);
    expect(joinStroke(b, [])).toEqual([b]);

    const first = commitDrawStroke([], [a, b]);
    expect(first).toEqual([[a, b]]);
    expect(drawEnd(first)).toEqual(b);
    const second = commitDrawStroke(first, [away, c], b);
    expect(second).toEqual([[a, b], [b, away, c]]);
    expect(combineDrawStrokes(second)).toEqual([a, b, away, c]);
    expect(commitDrawStroke(first, [b], b)).toEqual(first);
    expect(commitDrawStroke([], [a])).toEqual([]);
  });

  it('continues from the snapped end once every stroke has a route, and from the raw end until then', () => {
    const strokes = [[a, b]];
    expect(continuationEnd([], [a, snappedEnd], 0)).toBeNull();
    expect(continuationEnd(strokes, [a, snappedEnd], 1)).toEqual(snappedEnd);
    expect(continuationEnd([...strokes, [snappedEnd, c]], [a, snappedEnd], 1)).toEqual(c);
  });

  it('undo removes only the last stroke and clear removes every stroke', () => {
    const strokes = commitDrawStroke(commitDrawStroke([], [a, b]), [away, c], b);
    const undone = undoDrawStroke(strokes);
    expect(undone).toEqual([[a, b]]);
    expect(combineDrawStrokes(undone)).toEqual([a, b]);
    expect(undoDrawStroke(undone)).toEqual([]);
    expect(undoDrawStroke([])).toEqual([]);
    expect(clearDrawStrokes()).toEqual([]);
    expect(strokes).toHaveLength(2);
  });

  it('keeps earlier snapped points when a later stroke has not snapped yet', () => {
    const routed = [a, { latitude: 51.451, longitude: -2.589 }, snappedEnd];
    const strokes = [[a, b], [snappedEnd, away, c]];
    expect(visibleDrawLine(routed, strokes, 1)).toEqual([...routed, away, c]);
    expect(visibleDrawLine(routed, [[a, b]], 1)).toEqual(routed);
    expect(visibleDrawLine(routed, [], 0)).toEqual(routed);
    expect(visibleDrawLine(null, [[a, b], [b, c]], 0)).toEqual([a, b, c]);
    expect(stitchRoute(routed, [snappedEnd, c])).toEqual([...routed, c]);
    expect(stitchRoute(routed, [])).toEqual(routed);
    expect(stitchRoute([], [a, b])).toEqual([a, b]);
  });
});
