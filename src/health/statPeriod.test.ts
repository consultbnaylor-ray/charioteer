import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
  },
}));

import { loadHealthStatPeriod, saveHealthStatPeriod } from '@/health/statPeriod';

describe('health stat period memory', () => {
  beforeEach(() => {
    store.clear();
  });

  it('starts on 7 days and keeps the next choice', async () => {
    expect(await loadHealthStatPeriod()).toBe('7');
    await saveHealthStatPeriod('30');
    expect(store.get('charioteer.health.statPeriod')).toBe('30');
    expect(await loadHealthStatPeriod()).toBe('30');
    store.set('charioteer.health.statPeriod', 'later');
    expect(await loadHealthStatPeriod()).toBe('7');
    await saveHealthStatPeriod('day');
    expect(await loadHealthStatPeriod()).toBe('day');
  });
});
