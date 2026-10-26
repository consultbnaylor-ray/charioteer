import { afterEach, describe, expect, it, vi } from 'vitest';

import { OUTING_TIME_LIMIT_MS } from '@/domain/activitySession';
import {
  ensureActivityWatch,
  outingWatchOptions,
  pauseActivityWatch,
  setOutingHooks,
  stopActivityWatch,
  type ActivityWatchDeps,
} from '@/location/activityFix';

function deps(status: string, watch = vi.fn(async () => ({ remove: vi.fn() }))): ActivityWatchDeps & { watch: typeof watch } {
  return {
    os: 'ios',
    getForegroundPermissionsAsync: async () => ({ status: 'undetermined' }),
    requestForegroundPermissionsAsync: async () => ({ status }),
    watchPositionAsync: watch,
    watch,
  };
}

describe('outing watch', () => {
  afterEach(() => {
    stopActivityWatch();
    setOutingHooks(null);
    vi.useRealTimers();
  });

  it('uses a balanced fitness watch and stops it', async () => {
    const watch = vi.fn(async () => ({ remove: vi.fn() }));
    const hooked = deps('granted', watch);
    setOutingHooks({ onFix: () => undefined, onLimit: () => undefined });
    const result = await ensureActivityWatch(Date.now(), hooked);
    expect(result).toEqual({ ok: false, reason: 'waiting' });
    expect(watch).toHaveBeenCalledTimes(1);
    expect(watch.mock.calls[0][0]).toEqual(outingWatchOptions('ios'));
    expect(outingWatchOptions('ios')).toMatchObject({
      accuracy: 'balanced',
      distanceInterval: 10,
      activityType: 'fitness',
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      allowsBackgroundUpdates: true,
    });
    expect(outingWatchOptions('android')).not.toHaveProperty('activityType');
    pauseActivityWatch();
    expect(watch.mock.results[0]).toBeDefined();
    const handle = await watch.mock.results[0].value;
    expect(handle.remove).toHaveBeenCalledTimes(1);
  });

  it('does not watch when while-using permission is refused', async () => {
    const watch = vi.fn(async () => ({ remove: vi.fn() }));
    const result = await ensureActivityWatch(Date.now(), deps('denied', watch));
    expect(result).toEqual({ ok: false, reason: 'denied' });
    expect(watch).not.toHaveBeenCalled();
  });

  it('stops the watch when the time limit is reached', async () => {
    vi.useFakeTimers();
    const remove = vi.fn();
    const watch = vi.fn(async () => ({ remove }));
    const onLimit = vi.fn();
    setOutingHooks({ onFix: () => undefined, onLimit });
    await ensureActivityWatch(Date.now() - OUTING_TIME_LIMIT_MS, deps('granted', watch));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onLimit).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
