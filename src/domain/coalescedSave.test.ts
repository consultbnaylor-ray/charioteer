import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHOICE_SAVE_MS, CoalescedSave } from '@/domain/coalescedSave';
import { profileWithColumn, profileWithPatch } from '@/domain/profilePatch';
import type { Profile } from '@/data/types';

afterEach(() => {
  vi.useRealTimers();
});

function laneOf(initial: string, writes: string[], gate: { release: () => void; hold: boolean }) {
  return new CoalescedSave<string>(initial, async (value) => {
    writes.push(value);
    if (gate.hold) await new Promise<void>((resolve) => {
      gate.release = resolve;
    });
  }, Object.is, CHOICE_SAVE_MS);
}

describe('coalesced choice saves', () => {
  it('paints the latest value and sends it once after the quiet gap', async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const gate = { release: () => undefined, hold: false };
    const lane = laneOf('maintain', writes, gate);
    const first = lane.choose('lose_weight');
    const second = lane.choose('increase');
    expect(lane.value).toBe('increase');
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(CHOICE_SAVE_MS);
    expect(writes).toEqual(['increase']);
    await first;
    await second;
    expect(lane.dirty).toBe(false);
  });

  it('sends a trailing value after an in-flight write, and skips the one in between', async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const gate = { release: () => undefined, hold: true };
    const lane = laneOf('maintain', writes, gate);
    const first = lane.choose('lose_weight');
    await vi.advanceTimersByTimeAsync(CHOICE_SAVE_MS);
    expect(writes).toEqual(['lose_weight']);
    const middle = lane.choose('lose_fat_build_muscle');
    const last = lane.choose('increase');
    await vi.advanceTimersByTimeAsync(CHOICE_SAVE_MS);
    expect(writes).toEqual(['lose_weight']);
    gate.hold = false;
    gate.release();
    await first;
    await vi.advanceTimersByTimeAsync(CHOICE_SAVE_MS);
    expect(writes).toEqual(['lose_weight', 'increase']);
    await middle;
    await last;
  });

  it('reverts only when the failed write is still the latest choice', async () => {
    vi.useFakeTimers();
    const lane = new CoalescedSave<string>('woman', async () => {
      throw new Error('offline');
    }, Object.is, CHOICE_SAVE_MS);
    const failed = lane.choose('man');
    const caught = failed.then(() => 'kept', () => 'reverted');
    await vi.advanceTimersByTimeAsync(CHOICE_SAVE_MS);
    await expect(caught).resolves.toBe('reverted');
    expect(lane.value).toBe('woman');

    let rejectWrite: (error: Error) => void = () => undefined;
    const racing = new CoalescedSave<string>('maintain', () => new Promise<void>((_resolve, reject) => {
      rejectWrite = reject;
    }), Object.is, CHOICE_SAVE_MS);
    const earlier = racing.choose('lose_weight');
    await vi.advanceTimersByTimeAsync(CHOICE_SAVE_MS);
    const later = racing.choose('increase');
    rejectWrite(new Error('offline'));
    await expect(earlier.then(() => 'kept', () => 'reverted')).resolves.toBe('kept');
    expect(racing.value).toBe('increase');
    expect(racing.dirty).toBe(true);
    void later;
  });

  it('keeps an unconfirmed choice when a reload arrives', () => {
    const lane = new CoalescedSave<string>('maintain', async () => undefined, Object.is, CHOICE_SAVE_MS);
    void lane.choose('increase');
    expect(lane.seen('maintain')).toBe('increase');
    expect(lane.dirty).toBe(true);
  });
});

describe('profile chip patch', () => {
  const profile = {
    themePreference: 'dark',
    textScale: 'default',
    communityVisible: false,
    drinkFreeOn: ['2026-10-01'],
    displayName: 'Alex',
    town: 'Bristol',
    bio: '',
  } as Profile;

  it('shows the chosen theme before the row is saved', () => {
    const next = profileWithPatch(profile, { themePreference: 'light' });
    expect(next.themePreference).toBe('light');
    expect(next.displayName).toBe('Alex');
    const saved = profileWithColumn(profile, { theme_preference: 'light', drink_free_on: ['2026-10-13'] });
    expect(saved.themePreference).toBe('light');
    expect(saved.drinkFreeOn).toEqual(['2026-10-13']);
  });
});
