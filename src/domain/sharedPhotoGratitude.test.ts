import { readFileSync } from 'node:fs';
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
import { gratitudeStoragePath } from '@/domain/gratitudePhotos';
import { gratitudeLineFromSharedCaption, SAVED_FROM_SHARED_PHOTO } from '@/domain/sharedPhotos';

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

describe('save a shared photo to gratitude', () => {
  it('keeps the caption, and uses a line when the caption is blank', () => {
    expect(gratitudeLineFromSharedCaption('  Window light  ')).toBe('Window light');
    expect(gratitudeLineFromSharedCaption('   ')).toBe(SAVED_FROM_SHARED_PHOTO);
  });

  it('copies the file into the current user folder, not the sender path', async () => {
    const repo = await signedIn();
    const userId = repo.getSnapshot().profile?.id ?? '';
    const senderPath = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg';
    await repo.saveSharedPhotoToGratitude({ caption: 'A quiet kitchen', bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]) });
    const entry = repo.getSnapshot().gratitude.find((item) => item.body === 'A quiet kitchen');
    expect(entry?.photos).toHaveLength(1);
    const photo = entry?.photos[0];
    expect(photo?.storagePath).toBe(gratitudeStoragePath(userId, photo?.id ?? ''));
    expect(photo?.storagePath.startsWith(`${userId}/`)).toBe(true);
    expect(photo?.storagePath).not.toBe(senderPath);
    const screen = readFileSync('src/ui/SharedPhotos.tsx', 'utf8');
    expect(screen).toContain('Save to Gratitude');
    expect(screen).toContain('saveSharedPhotoToGratitude');
    const latestExport = readFileSync('supabase/migrations/20261029122000_export_my_data_missing.sql', 'utf8');
    expect(latestExport).toContain('gratitude_photos');
    expect(latestExport).toContain('gp.user_id = uid');
    const deleted = readFileSync('supabase/functions/account-delete/index.ts', 'utf8');
    expect(deleted).toContain('gratitude-photos');
    expect(deleted.indexOf('removeGratitudePhotos')).toBeLessThan(deleted.indexOf('deleteUser'));
  });
});
