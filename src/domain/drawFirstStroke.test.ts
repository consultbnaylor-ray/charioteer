import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  applyDrawPointers,
  createFrameBatcher,
  finishDrawSession,
  startDrawSession,
  strokePointFromTouch,
  type DrawOverlay,
  type DrawTouch,
} from '@/domain/drawStroke';
import { type OutdoorPoint } from '@/domain/outdoorRoute';

/**
 * Build 135 screenshot, iPhone full-screen map: overlay 440 x 600 at window y 62.
 * The first stroke showed one straight line about 137 pt south from the touch,
 * then a short hook. The vertical part was a single segment with no samples in it.
 */
const frame: DrawOverlay = {
  ready: true,
  originX: 0,
  originY: 62,
  width: 440,
  height: 600,
  centre: { latitude: 52.95, longitude: -1.25 },
  zoom: 17,
};

type Sample = { at: number; x: number; y: number };

/** Ben's finger: down at the touch, about 140 pt south in 140 ms, then a short hook east. */
function fingerPath(): Sample[] {
  const samples: Sample[] = [];
  for (let at = 0; at <= 140; at += 8) samples.push({ at, x: 214, y: 313 + at });
  for (let step = 1; step <= 6; step += 1) samples.push({ at: 140 + step * 8, x: 214 + step * 4, y: 453 + step });
  return samples;
}

function touchOf(sample: Sample): DrawTouch {
  return {
    pageX: sample.x + frame.originX,
    pageY: sample.y + frame.originY,
    locationX: sample.x,
    locationY: sample.y,
  };
}

/**
 * React Native's new architecture: touchStart is queued as-is, touchMove is a
 * unique event, so a newer move replaces one JS has not read yet.
 * `cost` is how long the JS thread is busy after handling one sample.
 * Frame callbacks run on the same JS thread every 16 ms.
 */
function runOnJsThread(input: {
  samples: Sample[];
  onSample: (sample: Sample, index: number) => number;
  frames?: { take: () => (() => number) | null };
}): Sample[] {
  const handled: Sample[] = [];
  const queue = input.samples.map((sample, index) => ({ sample, index }));
  let clock = 0;
  let pendingMove: { sample: Sample; index: number } | null = null;
  let nextFrame = 16;
  let cursor = 0;
  let handledCount = 0;
  while (cursor < queue.length || pendingMove) {
    // Everything that arrived while JS was busy. Moves coalesce to the newest.
    while (cursor < queue.length && (queue[cursor]?.sample.at ?? Infinity) <= clock) {
      const item = queue[cursor];
      cursor += 1;
      if (!item) continue;
      if (item.index === 0) {
        clock += input.onSample(item.sample, handledCount);
        handledCount += 1;
        handled.push(item.sample);
      } else {
        pendingMove = item;
      }
    }
    if (input.frames && clock >= nextFrame) {
      const run = input.frames.take();
      nextFrame = Math.floor(clock / 16) * 16 + 16;
      if (run) {
        clock += run();
        continue;
      }
    }
    if (pendingMove) {
      const item = pendingMove;
      pendingMove = null;
      clock += input.onSample(item.sample, handledCount);
      handledCount += 1;
      handled.push(item.sample);
      continue;
    }
    const upcoming = queue[cursor]?.sample.at;
    if (upcoming == null) break;
    clock = Math.max(clock, upcoming);
  }
  return handled;
}

function widestGap(samples: Sample[]): number {
  let widest = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const prev = samples[index - 1];
    const next = samples[index];
    if (!prev || !next) continue;
    widest = Math.max(widest, Math.hypot(next.x - prev.x, next.y - prev.y));
  }
  return widest;
}

describe('first draw stroke', () => {
  it('reproduces the build 135 chord when every sample re-renders the route screen', () => {
    let session = startDrawSession();
    // Build 135: each sample called setPencil on RouteMaker. That re-rendered the
    // screen and the map, which JSON.stringifies the whole map style on every
    // render. The first render also mounts the tick and the undo and clear state.
    const handled = runOnJsThread({
      samples: fingerPath(),
      onSample: (sample, index) => {
        const point = strokePointFromTouch(touchOf(sample), frame);
        session = applyDrawPointers(session, 1, point);
        return index === 0 ? 150 : 12;
      },
    });
    const stroke = finishDrawSession(session);
    expect(stroke.length).toBeGreaterThanOrEqual(2);
    expect(stroke.length).toBeLessThanOrEqual(handled.length);
    expect(handled[0]).toEqual({ at: 0, x: 214, y: 313 });
    // One straight segment, about 137 pt long, from the touch southwards.
    expect(widestGap(handled)).toBeGreaterThan(120);
    expect(handled[1]?.y ?? 0).toBeGreaterThan(handled[0]?.y ?? 0);
    expect(Math.abs((handled[1]?.x ?? 0) - 214)).toBeLessThan(6);
  });

  it('keeps the finger path when samples are stored and the preview waits for a frame', () => {
    let session = startDrawSession();
    let frameRun: (() => void) | null = null;
    let previews = 0;
    let shown: OutdoorPoint[] = [];
    const preview = createFrameBatcher<OutdoorPoint[]>(
      (points) => {
        previews += 1;
        shown = points;
      },
      (run) => {
        frameRun = run;
        return 1;
      },
      () => {
        frameRun = null;
      },
    );
    const handled = runOnJsThread({
      samples: fingerPath(),
      // Storing a sample is a projection and an append.
      onSample: (sample) => {
        const point = strokePointFromTouch(touchOf(sample), frame);
        session = applyDrawPointers(session, 1, point);
        preview.push(session.points);
        return 0.3;
      },
      // The live line is its own small source, re-rendered once per frame.
      frames: {
        take: () => {
          const run = frameRun;
          frameRun = null;
          if (!run) return null;
          return () => {
            run();
            return 3;
          };
        },
      },
    });
    const stroke = finishDrawSession(session);
    expect(handled.length).toBe(fingerPath().length);
    expect(widestGap(handled)).toBeLessThan(12);
    expect(stroke.length).toBeGreaterThan(15);
    expect(previews).toBeGreaterThan(0);
    expect(previews).toBeLessThan(handled.length);
    expect(shown.length).toBeGreaterThan(0);
  });

  it('draws the preview at most once per frame and never loses the newest points', () => {
    const published: number[][] = [];
    const frames: (() => void)[] = [];
    const batcher = createFrameBatcher<number[]>(
      (value) => published.push(value),
      (run) => frames.push(run),
      () => undefined,
    );
    for (let index = 1; index <= 40; index += 1) batcher.push([index]);
    expect(frames).toHaveLength(1);
    expect(published).toEqual([]);
    expect(batcher.pending()).toBe(true);
    frames.shift()?.();
    expect(published).toEqual([[40]]);
    expect(batcher.pending()).toBe(false);

    batcher.push([41]);
    batcher.flush();
    expect(published).toEqual([[40], [41]]);

    batcher.push([42]);
    batcher.cancel();
    frames.forEach((run) => run());
    expect(published).toEqual([[40], [41]]);

    const sync: number[] = [];
    const immediate = createFrameBatcher<number>((value) => sync.push(value), (run) => run(), () => undefined);
    immediate.push(1);
    immediate.push(2);
    expect(sync).toEqual([1, 2]);
  });

  it('keeps the route screen out of the stroke until the finger lifts', () => {
    const capture = readFileSync('src/ui/DrawCapture.tsx', 'utf8');
    expect(capture).toContain('createFrameBatcher');
    expect(capture).toContain('preview.current.push(next.points)');
    expect(capture).not.toContain('onChange(next.points)');
    const native = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    expect(native).toContain('onChange={(points) => live.current?.show(points)}');
    expect(native).not.toContain('drawRef.current?.onChange(points)');
    expect(native).toContain('<LiveStroke ref={live}');
  });
});
