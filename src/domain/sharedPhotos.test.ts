import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ALLOW_SAVE_LABEL,
  AUTO_SAVE_LABEL,
  SCREENSHOT_NOTE,
  SENDER_SAVE_NOTE,
  SHARED_PHOTOS_LABEL,
  buddyMaySave,
  filterSharedPhotos,
  sharedPhotoWhen,
  shouldAutoSaveToAlbum,
  splitSharedPhotos,
  type SharedPhotoCard,
} from './sharedPhotos';

const sent: SharedPhotoCard = {
  id: 'sent-later',
  mine: true,
  caption: 'Morning light',
  createdAt: '2026-10-25T07:41:00.000Z',
  allowSave: true,
  buddyNames: ['Catherine', 'Paul'],
};

const sentEarlier: SharedPhotoCard = {
  id: 'sent-earlier',
  mine: true,
  caption: 'Gate',
  createdAt: '2026-10-24T18:05:00.000Z',
  buddyNames: ['Emma'],
};

const received: SharedPhotoCard = {
  id: 'received',
  mine: false,
  caption: 'The lane',
  createdAt: '2026-10-25T06:02:00.000Z',
  allowSave: false,
  buddyNames: ['Ceri'],
};

describe('Shared Photos folder', () => {
  it('prints the date and time in UK form on the device clock', () => {
    expect(sharedPhotoWhen(new Date(2026, 9, 25, 7, 41))).toBe('25 Oct 2026, 07:41');
    expect(SENDER_SAVE_NOTE).toBe(
      "Buddies you share with can save this photo to their phone. Deleting it in Charioteer won't remove a copy they've already saved.",
    );
    expect(ALLOW_SAVE_LABEL).toBe('Allow buddies to save this photo');
    expect(AUTO_SAVE_LABEL).toBe('Automatically save photos I share to my Charioteer album');
    expect(SCREENSHOT_NOTE).toBe('A screenshot cannot be stopped.');
    expect(SHARED_PHOTOS_LABEL).toBe('Shared Photos');
  });

  it('splits sent and received, newest first, and can filter by one buddy', () => {
    const split = splitSharedPhotos([received, sentEarlier, sent]);
    expect(split.sent.map((row) => row.id)).toEqual(['sent-later', 'sent-earlier']);
    expect(split.received.map((row) => row.id)).toEqual(['received']);
    expect(filterSharedPhotos(split.sent, 'Catherine').map((row) => row.id)).toEqual(['sent-later']);
    expect(filterSharedPhotos(split.sent, 'Emma').map((row) => row.id)).toEqual(['sent-earlier']);
    expect(filterSharedPhotos([sent, received], null)).toHaveLength(2);
  });

  it('lets a buddy save only when the sender allowed it, and never saves a received photo on its own', () => {
    expect(buddyMaySave({ allowSave: true })).toBe(true);
    expect(buddyMaySave({})).toBe(true);
    expect(buddyMaySave({ allowSave: false })).toBe(false);
    expect(shouldAutoSaveToAlbum({ mine: true, autoSaveMine: false })).toBe(false);
    expect(shouldAutoSaveToAlbum({ mine: true, autoSaveMine: true })).toBe(true);
    expect(shouldAutoSaveToAlbum({ mine: false, autoSaveMine: true })).toBe(false);
  });

  it('stores the save choice on the photo and does not add the album permission yet', () => {
    const sql = readFileSync('supabase/migrations/20261025120000_buddy_photos.sql', 'utf8');
    expect(sql).toContain('allow_save boolean not null default true');
    expect(sql).toContain("'allowSave', p.allow_save");
    expect(sql).toContain("values ('buddy-photos', 'buddy-photos', false, 2097152");
    expect(sql).not.toMatch(/grant select on table public\.buddy_photos/i);
    const app = readFileSync('app.json', 'utf8');
    expect(app).not.toContain('NSPhotoLibraryAddUsageDescription');
    expect(app).not.toContain('expo-media-library');
    expect(readFileSync('package.json', 'utf8')).not.toContain('expo-media-library');
  });
});
