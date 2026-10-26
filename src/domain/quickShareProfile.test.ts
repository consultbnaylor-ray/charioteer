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
import { PROFILE_GALLERY_LIMIT, PROFILE_GALLERY_LIMIT_MESSAGE } from '@/domain/profilePhotos';

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

describe('quick share on the public gallery', () => {
  it('adds a gallery photo the public profile can show, and replaces only the one that was chosen', async () => {
    const repo = await signedIn();
    const me = repo.getSnapshot().profile?.id ?? '';
    const before = repo.getSnapshot().profilePhotos.filter((photo) => photo.role === 'gallery');
    expect(before.length).toBeLessThan(PROFILE_GALLERY_LIMIT);
    await repo.addProfilePhoto({ bytes: new Uint8Array([1, 2, 3]), role: 'gallery', caption: 'Monday light' });
    const added = repo.getSnapshot().profilePhotos.find((photo) => photo.caption === 'Monday light');
    expect(added?.role).toBe('gallery');
    expect(added?.previewUrl?.startsWith('data:image')).toBe(true);
    const shown = await repo.publicProfile(me);
    expect(shown?.profilePhotos.some((photo) => photo.id === added?.id && photo.caption === 'Monday light')).toBe(true);

    const room = PROFILE_GALLERY_LIMIT - repo.getSnapshot().profilePhotos.filter((photo) => photo.role === 'gallery').length;
    for (let index = 0; index < room; index += 1) {
      await repo.addProfilePhoto({ bytes: new Uint8Array([index + 1]), role: 'gallery', caption: `Extra ${index}` });
    }
    expect(repo.getSnapshot().profilePhotos.filter((photo) => photo.role === 'gallery')).toHaveLength(PROFILE_GALLERY_LIMIT);
    await expect(repo.addProfilePhoto({ bytes: new Uint8Array([9]), role: 'gallery', caption: 'Too many' })).rejects.toThrow(PROFILE_GALLERY_LIMIT_MESSAGE);
    expect(repo.getSnapshot().profilePhotos.some((photo) => photo.caption === 'Too many')).toBe(false);

    const replaced = await repo.publicProfile(me);
    const victim = replaced?.profilePhotos.find((photo) => photo.role === 'gallery' && photo.caption === 'Monday light');
    expect(victim).toBeTruthy();
    await repo.addProfilePhoto({
      bytes: new Uint8Array([4, 5, 6]),
      role: 'gallery',
      caption: 'Chosen replacement',
      replaceId: victim?.id,
    });
    const after = repo.getSnapshot().profilePhotos.filter((photo) => photo.role === 'gallery');
    expect(after).toHaveLength(PROFILE_GALLERY_LIMIT);
    expect(after.some((photo) => photo.id === victim?.id)).toBe(false);
    const replacement = after.find((photo) => photo.caption === 'Chosen replacement');
    expect(replacement?.previewUrl?.startsWith('data:image')).toBe(true);
    const visible = await repo.publicProfile(me);
    expect(visible?.profilePhotos.some((photo) => photo.id === replacement?.id)).toBe(true);
    expect(visible?.profilePhotos.some((photo) => photo.id === victim?.id)).toBe(false);

    await repo.deleteProfilePhoto(replacement!.id);
    const gone = await repo.publicProfile(me);
    expect(gone?.profilePhotos.some((photo) => photo.id === replacement?.id)).toBe(false);
    expect(repo.getSnapshot().profilePhotos.some((photo) => photo.id === replacement?.id)).toBe(false);
  });
});
