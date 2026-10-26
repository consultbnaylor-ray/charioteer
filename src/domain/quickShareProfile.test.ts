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
import { galleryInChosenOrder, profileFrontPhotos, PUBLIC_PROFILE_FRONT_COUNT } from '@/domain/profilePhotos';

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
  it('adds a gallery photo with no count limit, shows it first, and delete removes it at once', async () => {
    const repo = await signedIn();
    const me = repo.getSnapshot().profile?.id ?? '';
    const before = galleryInChosenOrder(repo.getSnapshot().profilePhotos);
    await repo.addProfilePhoto({ bytes: new Uint8Array([1, 2, 3]), role: 'gallery', caption: 'Monday light' });
    const added = repo.getSnapshot().profilePhotos.find((photo) => photo.caption === 'Monday light');
    expect(added?.role).toBe('gallery');
    expect(added?.position).toBe(0);
    expect(added?.previewUrl?.startsWith('data:image')).toBe(true);
    expect(galleryInChosenOrder(repo.getSnapshot().profilePhotos)[0]?.id).toBe(added?.id);
    expect(galleryInChosenOrder(repo.getSnapshot().profilePhotos)).toHaveLength(before.length + 1);
    const shown = await repo.publicProfile(me);
    expect(shown?.profilePhotos.some((photo) => photo.id === added?.id && photo.caption === 'Monday light')).toBe(true);

    for (let index = 0; index < 8; index += 1) {
      await repo.addProfilePhoto({ bytes: new Uint8Array([index + 1]), role: 'gallery', caption: `Extra ${index}` });
    }
    const many = galleryInChosenOrder(repo.getSnapshot().profilePhotos);
    expect(many.length).toBeGreaterThan(PUBLIC_PROFILE_FRONT_COUNT);
    expect(many[0]?.caption).toBe('Extra 7');
    expect(profileFrontPhotos(many)).toHaveLength(PUBLIC_PROFILE_FRONT_COUNT);
    const visible = await repo.publicProfile(me);
    expect(visible?.profilePhotos.filter((photo) => photo.role === 'gallery').length).toBe(many.length);

    const newest = many[0];
    expect(newest).toBeTruthy();
    await repo.deleteProfilePhoto(newest!.id);
    const gone = await repo.publicProfile(me);
    expect(gone?.profilePhotos.some((photo) => photo.id === newest?.id)).toBe(false);
    expect(repo.getSnapshot().profilePhotos.some((photo) => photo.id === newest?.id)).toBe(false);
  });
});
