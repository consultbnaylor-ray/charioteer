import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OUTING_TIME_LIMIT_MS } from '@/domain/activitySession';
import {
  ensureActivityWatch,
  mapOutingWatchOptions,
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

  it('uses a high-accuracy fitness watch and stops it', async () => {
    const watch = vi.fn(async () => ({ remove: vi.fn() }));
    const hooked = deps('granted', watch);
    setOutingHooks({ onFix: () => undefined, onLimit: () => undefined });
    const result = await ensureActivityWatch(Date.now(), hooked);
    expect(result).toEqual({ ok: false, reason: 'waiting' });
    expect(watch).toHaveBeenCalledTimes(1);
    const native = mapOutingWatchOptions(outingWatchOptions('ios'), { accuracyHigh: 4, fitness: 3 }, 'ios');
    expect(hooked.toNativeOptions ? null : watch.mock.calls[0][0]).toEqual(outingWatchOptions('ios'));
    expect(native).toEqual({
      accuracy: 4,
      distanceInterval: 10,
      activityType: 3,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      allowsBackgroundUpdates: true,
    });
    expect(outingWatchOptions('android')).toMatchObject({ accuracy: 'high', distanceInterval: 10 });
    expect(outingWatchOptions('android')).not.toHaveProperty('activityType');
    expect(outingWatchOptions('android')).not.toHaveProperty('allowsBackgroundUpdates');
    pauseActivityWatch();
    const handle = await watch.mock.results[0].value;
    expect(handle.remove).toHaveBeenCalledTimes(1);
  });

  it('does not watch when while-using permission is refused', async () => {
    const watch = vi.fn(async () => ({ remove: vi.fn() }));
    const result = await ensureActivityWatch(Date.now(), deps('denied', watch));
    expect(result).toEqual({ ok: false, reason: 'denied' });
    expect(watch).not.toHaveBeenCalled();
  });

  it('stops before watching when the limit is already past', async () => {
    const watch = vi.fn(async () => ({ remove: vi.fn() }));
    const onLimit = vi.fn();
    setOutingHooks({ onFix: () => undefined, onLimit });
    await ensureActivityWatch(Date.now() - OUTING_TIME_LIMIT_MS, deps('granted', watch));
    expect(onLimit).toHaveBeenCalledTimes(1);
    expect(watch).not.toHaveBeenCalled();
  });

  it('stops the watch on the timer', async () => {
    vi.useFakeTimers();
    const remove = vi.fn();
    const watch = vi.fn(async () => ({ remove }));
    const onLimit = vi.fn();
    setOutingHooks({ onFix: () => undefined, onLimit });
    await ensureActivityWatch(Date.now(), deps('granted', watch));
    await vi.advanceTimersByTimeAsync(OUTING_TIME_LIMIT_MS);
    expect(onLimit).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stops the watch when a fix arrives after the limit, without waiting for the timer', async () => {
    const remove = vi.fn();
    let onReading: (reading: { coords?: { latitude?: number; longitude?: number; accuracy?: number | null }; timestamp?: number }) => void = () => undefined;
    const watch = vi.fn(async (_options: unknown, callback: typeof onReading) => {
      onReading = callback;
      return { remove };
    });
    const onLimit = vi.fn();
    const onFix = vi.fn();
    setOutingHooks({ onFix, onLimit });
    let nowMs = 5_000;
    await ensureActivityWatch(nowMs, deps('granted', watch), () => nowMs);
    onReading({ coords: { latitude: 51.45, longitude: -2.58, accuracy: 8 }, timestamp: nowMs });
    expect(onLimit).not.toHaveBeenCalled();
    expect(onFix).toHaveBeenCalledTimes(1);
    nowMs += OUTING_TIME_LIMIT_MS;
    onReading({ coords: { latitude: 51.451, longitude: -2.581, accuracy: 8 }, timestamp: nowMs });
    expect(onLimit).toHaveBeenCalledTimes(1);
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stops the watch when the app returns to the foreground after the limit', async () => {
    const remove = vi.fn();
    const watch = vi.fn(async () => ({ remove }));
    const onLimit = vi.fn();
    let onActive = () => undefined;
    setOutingHooks({ onFix: () => undefined, onLimit });
    let nowMs = 8_000;
    await ensureActivityWatch(nowMs, {
      ...deps('granted', watch),
      subscribeForeground: (callback) => {
        onActive = callback;
        return () => undefined;
      },
    }, () => nowMs);
    onActive();
    expect(onLimit).not.toHaveBeenCalled();
    nowMs += OUTING_TIME_LIMIT_MS;
    onActive();
    expect(onLimit).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not send a location fix on the network', async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === 'string' ? init.body : '';
      seen.push(`${url}\n${body}`);
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      let onReading: (reading: { coords?: { latitude?: number; longitude?: number; accuracy?: number | null }; timestamp?: number }) => void = () => undefined;
      const watch = vi.fn(async (_options: unknown, callback: typeof onReading) => {
        onReading = callback;
        return { remove: vi.fn() };
      });
      setOutingHooks({ onFix: () => undefined, onLimit: () => undefined });
      await ensureActivityWatch(Date.now(), deps('granted', watch));
      onReading({ coords: { latitude: 51.454513, longitude: -2.5879, accuracy: 8 }, timestamp: Date.now() });
      const blob = seen.join('\n');
      expect(blob).not.toContain('51.454513');
      expect(blob).not.toContain('-2.5879');
      expect(blob.toLowerCase()).not.toContain('latitude');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('keeps the patched Record fields that the watch sends', () => {
    const patch = readFileSync('patches/expo-location+57.0.22.patch', 'utf8');
    for (const field of ['activityType', 'pausesUpdatesAutomatically', 'showsBackgroundLocationIndicator', 'allowsBackgroundUpdates']) {
      expect(patch).toContain(`var ${field}`);
    }
    expect(patch).toContain('pausesUpdatesAutomatically: Bool = false');
    expect(patch).not.toContain('startMonitoringSignificantLocationChanges');
    const pinned = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: { 'expo-location': string } };
    expect(pinned.dependencies['expo-location']).toBe('57.0.22');
  });
});
