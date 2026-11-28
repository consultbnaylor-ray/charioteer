import { describe, expect, it } from 'vitest';

import {
  fingerInOverlay,
  freshOverlayMeasure,
  nextOverlayMeasure,
  strokePointFromTouch,
} from '@/domain/drawStroke';
import { fullScreenMapHeight } from '@/domain/fullScreenMap';
import { viewToPoint } from '@/domain/outdoorRoute';

// iPhone 17 Pro Max: 440 x 956 pt, 62 pt top inset, 34 pt home indicator.
const WIDTH = 440;
const HEIGHT = fullScreenMapHeight(956, 62, 34);
const centre = { latitude: 52.9225, longitude: -1.4746 };

function frameAt(originX: number, originY: number) {
  return { ready: true, originX, originY, width: WIDTH, height: HEIGHT, centre, zoom: 16 };
}

/** A touch at (x, y) in the map, reported against a page whose map origin is (pageOriginX, pageOriginY). */
function touchAt(x: number, y: number, pageOriginX: number, pageOriginY: number) {
  return { locationX: x, locationY: y, pageX: x + pageOriginX, pageY: y + pageOriginY };
}

describe('a drawn point sits under the finger', () => {
  it('stays on the finger in the full screen map when the measured origin is not the frame of the touch', () => {
    // Build 138: the map's measured window origin was further down than the
    // origin the touch's page position is reported against, so page minus the
    // measured origin put every point about 1-2 cm above the finger.
    const measured = frameAt(0, 62 + 96);
    const dot = { x: 220, y: 430 };
    const touch = touchAt(dot.x, dot.y, 0, 62);
    expect(fingerInOverlay(touch, measured)).toEqual(dot);
    const point = strokePointFromTouch(touch, measured);
    expect(point).toEqual(viewToPoint({ centre, zoom: 16, width: WIDTH, height: HEIGHT, x: dot.x, y: dot.y }));
    const above = viewToPoint({ centre, zoom: 16, width: WIDTH, height: HEIGHT, x: dot.x, y: dot.y - 96 });
    expect(point).not.toEqual(above);
    // The centre of the map is the camera centre, so a touch there is the centre.
    const middle = strokePointFromTouch(touchAt(WIDTH / 2, HEIGHT / 2, 0, 62), measured);
    expect(middle?.latitude).toBeCloseTo(centre.latitude, 9);
    expect(middle?.longitude).toBeCloseTo(centre.longitude, 9);
  });

  it('stays on the finger in the inline map after the page scrolled and the old origin is still held', () => {
    const stale = { ...frameAt(16, 640), height: 280 };
    const touch = touchAt(100, 140, 16, 410);
    expect(fingerInOverlay(touch, stale)).toEqual({ x: 100, y: 140 });
  });

  it('a whole stroke keeps its shape and place, sample by sample', () => {
    const measured = frameAt(0, 0);
    const path = [0, 10, 20, 30, 40].map((step) => ({ x: 220 + step, y: 430 - step * 2 }));
    const drawn = path.map((sample) => fingerInOverlay(touchAt(sample.x, sample.y, 0, 62), measured));
    expect(drawn).toEqual(path);
  });

  it('still corrects a first sample whose location is in page space', () => {
    const measured = frameAt(12, 62);
    const first = { locationX: 210, locationY: 430, pageX: 210, pageY: 430 };
    expect(fingerInOverlay(first, measured)).toEqual({ x: 198, y: 368 });
  });

  it('a map at the top left of the page needs no correction when page and location agree', () => {
    const measured = frameAt(0, 0);
    expect(fingerInOverlay({ locationX: 50, locationY: 70, pageX: 50, pageY: 70 }, measured)).toEqual({ x: 50, y: 70 });
  });

  it('uses page minus the measured origin only when there is no location', () => {
    const measured = frameAt(0, 62);
    expect(fingerInOverlay({ pageX: 100, pageY: 162 }, measured)).toEqual({ x: 100, y: 100 });
    expect(fingerInOverlay({ locationX: 100, locationY: 100 }, measured)).toEqual({ x: 100, y: 100 });
  });

  it('drops a touch outside the map and waits for a measurement', () => {
    const measured = frameAt(0, 62);
    expect(fingerInOverlay(touchAt(100, HEIGHT + 40, 0, 62), measured)).toBeNull();
    expect(fingerInOverlay(touchAt(100, 100, 0, 62), { ...measured, ready: false })).toBeNull();
  });

  it('confirms a moved map on the next reading instead of keeping the old origin', () => {
    const layout = { width: WIDTH, height: 280 };
    const first = { x: 16, y: 640, width: WIDTH, height: 280 };
    const moved = { x: 16, y: 410, width: WIDTH, height: 280 };
    let state = nextOverlayMeasure(freshOverlayMeasure(), first, layout).state;
    state = nextOverlayMeasure(state, first, layout).state;
    expect(state.ready).toEqual(first);
    const lone = nextOverlayMeasure(state, moved, layout);
    expect(lone.state.ready).toEqual(first);
    expect(lone.again).toBe(true);
    const confirmed = nextOverlayMeasure(lone.state, moved, layout);
    expect(confirmed.state.ready).toEqual(moved);
    expect(confirmed.again).toBe(false);
    // A reading that matches the confirmed frame asks for nothing more.
    expect(nextOverlayMeasure(confirmed.state, moved, layout).again).toBe(false);
  });
});
