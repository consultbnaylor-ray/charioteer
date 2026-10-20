import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { DemoRepository } from '@/data/demo-repository';
import { DEMO_PASSWORD } from '@/data/demo-seed';

import { isoDay } from './dates';
import { applyProfileSection, gratitudeSectionBoxes, gratitudeSectionPatch, sectionShareState } from './sectionShare';

async function signedIn(): Promise<DemoRepository> {
  const repo = new DemoRepository();
  await new Promise<void>((resolve) => {
    if (repo.getSnapshot().ready) {
      resolve();
      return;
    }
    const stop = repo.subscribe(() => {
      if (!repo.getSnapshot().ready) return;
      stop();
      resolve();
    });
  });
  await repo.signIn('alex.hart@example.com', DEMO_PASSWORD);
  return repo;
}

function line(body: string) {
  return { body, category: null, isFavourite: false, entryDate: isoDay(new Date()) };
}

describe('gratitude master follows the diary', () => {
  it('shares all ten current lines and their photos, then only new ones that were opted in', async () => {
    const repo = await signedIn();
    expect(repo.getSnapshot().gratitude).toHaveLength(3);
    for (let index = 0; index < 7; index += 1) {
      await repo.addGratitudeEntry(line(`Extra line ${index}`));
    }
    const grown = repo.getSnapshot();
    expect(grown.gratitude).toHaveLength(10);
    const already = grown.gratitude.find((entry) => entry.body.startsWith('My sister rang'));
    expect(grown.sharing.gratitudeIds).toEqual([already?.id]);
    expect(grown.sharing.gratitudePhotoIds).toEqual(already?.photos.map((photo) => photo.id));
    expect(grown.sharing.shareNewGratitude).toBe(false);
    const host = grown.gratitude.find((entry) => entry.photos.length === 0);
    expect(host).toBeTruthy();
    await repo.addGratitudePhoto(host!.id, new Uint8Array([1, 2, 3]));
    const ready = repo.getSnapshot();
    const photos = ready.gratitude.flatMap((entry) => entry.photos);
    expect(photos.length).toBeGreaterThanOrEqual(2);
    const patch = gratitudeSectionPatch(ready.gratitude);
    expect(patch.gratitudeIds).toHaveLength(10);
    expect(patch.gratitudePhotoIds).toEqual(photos.map((photo) => photo.id));
    await repo.setProfileSharing(applyProfileSection(ready.sharing, patch, true));
    const shared = repo.getSnapshot();
    expect(shared.sharing.gratitudeIds).toHaveLength(10);
    expect(shared.sharing.gratitudePhotoIds).toHaveLength(photos.length);
    expect(shared.sharing.shareNewGratitude).toBe(false);
    expect(sectionShareState(gratitudeSectionBoxes(shared.gratitude, shared.sharing.gratitudeIds, shared.sharing.gratitudePhotoIds))).toBe('on');

    const leftOut = await repo.addGratitudeEntry(line('After the master'));
    const mixed = repo.getSnapshot();
    expect(mixed.sharing.gratitudeIds).not.toContain(leftOut);
    expect(sectionShareState(gratitudeSectionBoxes(mixed.gratitude, mixed.sharing.gratitudeIds, mixed.sharing.gratitudePhotoIds))).toBe('mixed');

    await repo.setProfileSharing({ ...mixed.sharing, shareNewGratitude: true });
    const opted = await repo.addGratitudeEntry(line('Opted in'));
    await repo.addGratitudePhoto(opted, new Uint8Array([4, 5]));
    const after = repo.getSnapshot();
    const addedPhoto = after.gratitude.find((entry) => entry.id === opted)?.photos[0];
    expect(after.sharing.gratitudeIds).toContain(opted);
    expect(after.sharing.gratitudeIds).not.toContain(leftOut);
    expect(addedPhoto).toBeTruthy();
    expect(after.sharing.gratitudePhotoIds).toContain(addedPhoto!.id);
    expect(after.sharing.shareNewGratitude).toBe(true);
    expect(sectionShareState(gratitudeSectionBoxes(after.gratitude, after.sharing.gratitudeIds, after.sharing.gratitudePhotoIds))).toBe('mixed');
  });
});
