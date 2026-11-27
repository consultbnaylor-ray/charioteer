import { describe, expect, it } from 'vitest';

import {
  RUBBER_MAX_M,
  RUBBER_MIN_M,
  applyErase,
  densifyLine,
  eraseLine,
  eraseLines,
  metresPerPixel,
  needsRecalculate,
  nextDrawTool,
  nextUndoStep,
  pushUndo,
  rubberRadiusMetres,
  touchedByRubber,
  DRAW_UNDO_CAP,
  type DrawUndoEntry,
} from '@/domain/drawErase';
import { combineDrawStrokes } from '@/domain/drawStroke';
import { metresBetween, type OutdoorPoint } from '@/domain/outdoorRoute';

// Around Borrowash. One degree of latitude is about 111 km, so 0.0001 is about 11 m.
const BASE = { latitude: 52.905, longitude: -1.38 };

function north(metres: number, east = 0): OutdoorPoint {
  return {
    latitude: BASE.latitude + metres / 111_195,
    longitude: BASE.longitude + east / (111_195 * Math.cos((BASE.latitude * Math.PI) / 180)),
  };
}

/** A straight stroke north, one point every 2 m, like a finger. */
function stroke(fromM: number, toM: number, east = 0): OutdoorPoint[] {
  const out: OutdoorPoint[] = [];
  for (let m = fromM; m <= toM; m += 2) out.push(north(m, east));
  return out;
}

describe('rubber size', () => {
  it('matches the MapLibre scale (512 px tiles)', () => {
    // At zoom 15 on the equator one point is about 2.39 m.
    expect(metresPerPixel(0, 15)).toBeCloseTo(2.388, 2);
    expect(metresPerPixel(60, 15)).toBeCloseTo(2.388 / 2, 2);
  });

  it('grows as the map zooms out and stays within its limits', () => {
    const close = rubberRadiusMetres(BASE.latitude, 18);
    const far = rubberRadiusMetres(BASE.latitude, 13);
    expect(far).toBeGreaterThan(close);
    expect(rubberRadiusMetres(BASE.latitude, 22)).toBe(RUBBER_MIN_M);
    expect(rubberRadiusMetres(BASE.latitude, 2)).toBe(RUBBER_MAX_M);
    expect(rubberRadiusMetres(Number.NaN, 15)).toBe(RUBBER_MIN_M);
  });
});

describe('touchedByRubber', () => {
  it('counts a point near the drag path, not one further away', () => {
    const drag = [north(0, -50), north(0, 50)];
    expect(touchedByRubber(north(5), drag, 10)).toBe(true);
    expect(touchedByRubber(north(15), drag, 10)).toBe(false);
  });

  it('treats a tap as a circle', () => {
    expect(touchedByRubber(north(4), [north(0)], 5)).toBe(true);
    expect(touchedByRubber(north(8), [north(0)], 5)).toBe(false);
  });

  it('does nothing without a drag or a radius', () => {
    expect(touchedByRubber(north(0), [], 10)).toBe(false);
    expect(touchedByRubber(north(0), [north(0)], 0)).toBe(false);
  });
});

describe('eraseLine', () => {
  it('leaves a line the rubber did not touch exactly as it was', () => {
    const line = stroke(0, 100);
    const result = eraseLine(line, [north(0, 200), north(100, 200)], 10);
    expect(result.changed).toBe(false);
    expect(result.pieces).toEqual([line]);
  });

  it('wiping the middle splits the line into two pieces, in order', () => {
    const line = stroke(0, 200);
    const result = eraseLine(line, [north(100, -30), north(100, 30)], 10);
    expect(result.changed).toBe(true);
    expect(result.pieces).toHaveLength(2);
    const [first, second] = result.pieces as [OutdoorPoint[], OutdoorPoint[]];
    expect(metresBetween(first[0] as OutdoorPoint, north(0))).toBeLessThan(1);
    expect(metresBetween(second[second.length - 1] as OutdoorPoint, north(200))).toBeLessThan(1);
    // Nothing within the rubber is left.
    for (const point of [...first, ...second]) {
      expect(metresBetween(point, north(100))).toBeGreaterThan(9.9);
    }
  });

  it('wiping the end shortens the line', () => {
    const result = eraseLine(stroke(0, 100), [north(100)], 20);
    expect(result.pieces).toHaveLength(1);
    const piece = result.pieces[0] as OutdoorPoint[];
    expect(metresBetween(piece[piece.length - 1] as OutdoorPoint, north(100))).toBeGreaterThan(19.9);
  });

  it('wiping a whole line leaves nothing', () => {
    const result = eraseLine(stroke(0, 20), [north(0), north(20)], 15);
    expect(result).toEqual({ pieces: [], changed: true });
  });

  it('wipes where it crosses a long straight segment with no points nearby', () => {
    // A snapped road: two points 1 km apart.
    const road = [north(0), north(1000)];
    const result = eraseLine(road, [north(500, -30), north(500, 30)], 10);
    expect(result.changed).toBe(true);
    expect(result.pieces).toHaveLength(2);
  });
});

describe('densifyLine', () => {
  it('fills long segments and keeps the ends', () => {
    const dense = densifyLine([north(0), north(100)], 10);
    expect(dense.length).toBeGreaterThan(9);
    expect(dense[0]).toEqual(north(0));
    expect(dense[dense.length - 1]).toEqual(north(100));
  });
});

describe('eraseLines and Recalculate joining the gaps', () => {
  it('keeps the drawn order, so the pieces join up as one route', () => {
    const strokes = [stroke(0, 200), stroke(200, 400, 0)];
    // Rub out the unwanted out-and-back in the middle of the first stroke.
    const { lines, changed } = eraseLines(strokes, [north(60, -30), north(60, 30)], 8);
    expect(changed).toBe(true);
    expect(lines).toHaveLength(3);
    const joined = combineDrawStrokes(lines);
    // One line from the start to the end; the gap is just a jump the snap routes across.
    expect(metresBetween(joined[0] as OutdoorPoint, north(0))).toBeLessThan(1);
    expect(metresBetween(joined[joined.length - 1] as OutdoorPoint, north(400))).toBeLessThan(1);
    for (let index = 1; index < joined.length; index += 1) {
      expect(joined[index]!.latitude).toBeGreaterThanOrEqual(joined[index - 1]!.latitude);
    }
  });
});

describe('needsRecalculate', () => {
  const drawn = [stroke(0, 100)];

  it('is off before anything has been snapped', () => {
    expect(needsRecalculate({ strokes: drawn, lastSnapped: null, erased: true })).toBe(false);
  });

  it('is off when the drawing is what was snapped', () => {
    expect(needsRecalculate({ strokes: drawn, lastSnapped: drawn.map((line) => [...line]), erased: false })).toBe(false);
  });

  it('is on after a wipe', () => {
    expect(needsRecalculate({ strokes: drawn, lastSnapped: drawn, erased: true })).toBe(true);
  });

  it('is on when the drawing differs from the last snap', () => {
    expect(needsRecalculate({ strokes: [...drawn, stroke(100, 200)], lastSnapped: drawn, erased: false })).toBe(true);
  });

  it('is off when nothing is left to snap', () => {
    expect(needsRecalculate({ strokes: [], lastSnapped: drawn, erased: true })).toBe(false);
  });
});

describe('nextDrawTool', () => {
  it('the rubber starts draw mode in rubber, and a second tap goes back to the pen', () => {
    expect(nextDrawTool(false, 'pen', 'rubber')).toEqual({ drawing: true, tool: 'rubber' });
    expect(nextDrawTool(true, 'pen', 'rubber')).toEqual({ drawing: true, tool: 'rubber' });
    expect(nextDrawTool(true, 'rubber', 'rubber')).toEqual({ drawing: true, tool: 'pen' });
  });

  it('the pen still toggles draw mode, and from the rubber it goes back to drawing', () => {
    expect(nextDrawTool(false, 'pen', 'pen')).toEqual({ drawing: true, tool: 'pen' });
    expect(nextDrawTool(true, 'pen', 'pen')).toEqual({ drawing: false, tool: 'pen' });
    expect(nextDrawTool(true, 'rubber', 'pen')).toEqual({ drawing: true, tool: 'pen' });
  });

  it('stopping drawing always leaves the pen chosen', () => {
    expect(nextDrawTool(true, 'rubber', 'stop')).toEqual({ drawing: false, tool: 'pen' });
  });
});

describe('undo', () => {
  const eraseEntry: DrawUndoEntry = { kind: 'erase', strokes: [], snappedCount: 1, erasedSnap: null, strokesAfter: 2 };
  const snapEntry: DrawUndoEntry = { kind: 'snap', plan: null, snappedCount: 0, keptStrokes: 0 };

  it('takes back the finger still down first', () => {
    expect(nextUndoStep({ pencil: 3, strokes: 2, snappedCount: 2, top: eraseEntry })).toBe('pencil');
  });

  it('takes back a wipe', () => {
    expect(nextUndoStep({ pencil: 0, strokes: 2, snappedCount: 1, top: eraseEntry })).toBe('erase');
  });

  it('takes back strokes drawn after a wipe before the wipe itself', () => {
    expect(nextUndoStep({ pencil: 0, strokes: 3, snappedCount: 1, top: eraseEntry })).toBe('stroke');
  });

  it('keeps the existing order for strokes and snaps', () => {
    expect(nextUndoStep({ pencil: 0, strokes: 2, snappedCount: 1, top: snapEntry })).toBe('stroke');
    expect(nextUndoStep({ pencil: 0, strokes: 1, snappedCount: 1, top: snapEntry })).toBe('snap');
    expect(nextUndoStep({ pencil: 0, strokes: 1, snappedCount: 1, top: null })).toBe('stroke');
    expect(nextUndoStep({ pencil: 0, strokes: 0, snappedCount: 0, top: null })).toBe('none');
  });

  it('keeps a bounded stack', () => {
    let stack: DrawUndoEntry[] = [];
    for (let index = 0; index < DRAW_UNDO_CAP + 5; index += 1) stack = pushUndo(stack, snapEntry);
    expect(stack).toHaveLength(DRAW_UNDO_CAP);
  });
});

describe('applyErase', () => {
  const strokes = [stroke(0, 200)];
  const snappedLine = [north(0), north(100), north(200)];

  it('wipes the drawing and the green line, and records how to undo it', () => {
    const result = applyErase({
      strokes,
      snappedLine,
      erasedSnap: null,
      snappedCount: 1,
      path: [north(100, -30), north(100, 30)],
      radiusM: 10,
    });
    expect(result.changed).toBe(true);
    expect(result.strokes).toHaveLength(2);
    expect(result.erasedSnap).toHaveLength(2);
    expect(result.entry).toEqual({
      kind: 'erase',
      strokes,
      snappedCount: 1,
      erasedSnap: null,
      strokesAfter: 2,
    });
  });

  it('a wipe that misses everything changes nothing and adds no undo step', () => {
    const result = applyErase({
      strokes,
      snappedLine,
      erasedSnap: null,
      snappedCount: 1,
      path: [north(100, 500)],
      radiusM: 10,
    });
    expect(result.changed).toBe(false);
    expect(result.entry).toBeNull();
    expect(result.strokes).toEqual(strokes);
  });

  it('a second wipe works on what the first left', () => {
    const first = applyErase({ strokes, snappedLine, erasedSnap: null, snappedCount: 1, path: [north(50)], radiusM: 10 });
    const second = applyErase({
      strokes: first.strokes,
      snappedLine,
      erasedSnap: first.erasedSnap,
      snappedCount: 1,
      path: [north(150)],
      radiusM: 10,
    });
    expect(second.strokes).toHaveLength(3);
    expect(second.erasedSnap).toHaveLength(3);
    expect(second.entry?.kind).toBe('erase');
    if (second.entry?.kind === 'erase') expect(second.entry.erasedSnap).toEqual(first.erasedSnap);
  });
});

describe('privacy', () => {
  it('the rubber never logs or sends a position', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/domain/drawErase.ts', 'utf8');
    expect(source).not.toMatch(/console\.|fetch\(|functions\.invoke/);
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const erase = maker.slice(maker.indexOf('function eraseDrawn'), maker.indexOf('function holdStroke'));
    expect(erase.length).toBeGreaterThan(0);
    expect(erase).not.toMatch(/console\.|log[A-Z]\w*\(/);
  });

  it('the map wires the rubber, its wipe and Recalculate', async () => {
    const { readFileSync } = await import('node:fs');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).toContain('onErase: eraseDrawn');
    expect(maker).toContain('onRubber={craving ? undefined : toggleRubber}');
    expect(maker).toContain('canRecalculate={!craving && recalculate}');
    // Recalculate is the green tick's snap, not a separate route call.
    const recalc = maker.slice(maker.indexOf('async function recalculateDrawn'), maker.indexOf('/** The X.'));
    expect(recalc).toContain('await confirmDraw()');
    const chrome = readFileSync('src/ui/MapChrome.tsx', 'utf8');
    expect(chrome).toContain('accessibilityLabel={RECALCULATE_ROUTE}');
    expect(chrome).toContain('label={rubberOn ? RUBBER_ON_LABEL : RUBBER_LABEL}');
    expect(chrome).toContain('minHeight: 56');
  });
});
