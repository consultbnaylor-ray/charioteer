import { describe, expect, it } from 'vitest';

import {
  clearMadeRoute,
  copyMadeRoute,
  guideAsRoutes,
  holdMadeRoute,
  resetMadeRouteGuide,
  takeMadeRoute,
  type MadeRouteGuide,
} from '@/activity/madeRouteGuide';

const line: MadeRouteGuide = {
  title: 'Walk loop',
  kind: 'walk',
  points: [
    { latitude: 51.45, longitude: -2.59 },
    { latitude: 51.451, longitude: -2.591 },
  ],
};

describe('made route guide', () => {
  it('copies the line onto the phone and leaves later edits behind', () => {
    resetMadeRouteGuide();
    const source = {
      title: '  Walk loop  ',
      kind: 'walk' as const,
      points: line.points.map((point) => ({ ...point })),
    };
    holdMadeRoute(source);
    source.points[0].latitude = 0;
    source.title = 'Changed';
    const taken = takeMadeRoute('1');
    expect(taken?.title).toBe('Walk loop');
    expect(taken?.points[0].latitude).toBe(51.45);
    if (taken) taken.points[0].latitude = 9;
    expect(takeMadeRoute('1')?.points[0].latitude).toBe(51.45);
    expect(takeMadeRoute('2')).toBeNull();

    const frozen = copyMadeRoute(taken);
    expect(frozen).not.toBe(taken);
    expect(frozen?.points).not.toBe(taken?.points);
    expect(guideAsRoutes(frozen)[0]?.points).toHaveLength(2);
    expect(guideAsRoutes(frozen)[0]?.id).toBe('made-route-guide');
    expect(guideAsRoutes({ title: 'Short', kind: 'run', points: [line.points[0]] })).toEqual([]);
    expect(copyMadeRoute({ title: 'Short', kind: 'run', points: [line.points[0]] })).toBeNull();

    holdMadeRoute(line);
    clearMadeRoute();
    expect(takeMadeRoute('3')).toBeNull();
  });
});
