import { describe, expect, it } from 'vitest';

import {
  clampPlacement,
  coverPlacement,
  cropRectFromPlacement,
  fittedFrame,
  placementForCrop,
  resizeFrame,
  squareCropRect,
  zoomPlacement,
} from './photoCrop';
import { profileSquareCrop } from './profilePhotos';

describe('photo crop', () => {
  it('opens a profile picture on the centre square inside a circular frame', () => {
    const frame = fittedFrame(300, 420, 'square', 400, 200);
    expect(frame.width).toBeCloseTo(frame.height, 5);
    const seed = profileSquareCrop(400, 200);
    expect(seed).toEqual({ originX: 100, originY: 0, width: 200, height: 200 });
    const placed = placementForCrop(400, 200, frame, seed!);
    expect(cropRectFromPlacement(400, 200, frame, placed)).toEqual(seed);

    const tall = profileSquareCrop(200, 500);
    const tallFrame = fittedFrame(280, 280, 'square', 200, 500);
    expect(cropRectFromPlacement(200, 500, tallFrame, placementForCrop(200, 500, tallFrame, tall!))).toEqual(tall);
  });

  it('zooms about the centre and refuses to pan past the frame', () => {
    const frame = fittedFrame(200, 200, 'square', 400, 200);
    const seed = profileSquareCrop(400, 200)!;
    const start = placementForCrop(400, 200, frame, seed);
    const zoomed = zoomPlacement(start, start.scale * 2, frame, 400, 200);
    const tight = cropRectFromPlacement(400, 200, frame, zoomed);
    expect(tight.width).toBe(100);
    expect(tight.height).toBe(100);
    expect(tight.originX).toBe(150);
    expect(tight.originY).toBe(50);

    const shoved = clampPlacement({ ...start, x: start.x + 500, y: start.y + 80 }, 400, 200, frame);
    const edged = cropRectFromPlacement(400, 200, frame, shoved);
    expect(edged.originX).toBeGreaterThanOrEqual(0);
    expect(edged.originX + edged.width).toBeLessThanOrEqual(400);
    expect(shoved.x).toBeLessThanOrEqual(frame.x);
    expect(shoved.y).toBeCloseTo(start.y, 5);
  });

  it('offers a free crop and a 4:3 crop for gallery photos', () => {
    const free = fittedFrame(360, 400, 'free', 400, 200);
    expect(free.width / free.height).toBeCloseTo(2, 5);
    const whole = cropRectFromPlacement(400, 200, free, coverPlacement(400, 200, free));
    expect(whole).toEqual({ originX: 0, originY: 0, width: 400, height: 200 });

    const wide = resizeFrame(free, 'bottom', -40, 360, 400);
    expect(wide.height).toBeLessThan(free.height);
    expect(wide.width / wide.height).not.toBeCloseTo(free.width / free.height, 1);

    const four = fittedFrame(360, 400, '4:3', 400, 200);
    expect(four.width / four.height).toBeCloseTo(4 / 3, 5);
    const band = cropRectFromPlacement(400, 200, four, coverPlacement(400, 200, four));
    expect(band.width / band.height).toBeCloseTo(4 / 3, 1);
    expect(band.height).toBe(200);
    expect(squareCropRect(band, 400, 200).width).toBe(squareCropRect(band, 400, 200).height);
  });
});
