import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const picker = vi.hoisted(() => ({
  requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: true })),
  launchCameraAsync: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///var/mobile/Media/DCIM/photo.jpg', width: 1200, height: 800, exif: { DateTimeOriginal: '2026:10:12 09:00:00' } }],
  })),
  launchImageLibraryAsync: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///var/mobile/Media/PhotoData/library.jpg', width: 900, height: 900, exif: null }],
  })),
}));

const manipulator = vi.hoisted(() => ({
  manipulateAsync: vi.fn(async () => ({
    uri: 'file:///var/mobile/tmp/prepared.jpg',
    width: 800,
    height: 533,
    base64: Buffer.from('jpeg-bytes').toString('base64'),
  })),
}));

vi.mock('expo-image-picker', () => picker);
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: manipulator.manipulateAsync,
}));

import { pickProgressPhoto } from './prepareProgressPhoto';

const pickerOptions = { mediaTypes: ['images'], exif: true, quality: 1 };

describe('iOS photo picker', () => {
  beforeEach(() => {
    picker.requestCameraPermissionsAsync.mockClear();
    picker.requestMediaLibraryPermissionsAsync.mockClear();
    picker.launchCameraAsync.mockClear();
    picker.launchImageLibraryAsync.mockClear();
    manipulator.manipulateAsync.mockClear();
  });

  it('takes a photo through the native image picker', async () => {
    const source = readFileSync('src/ui/prepareProgressPhoto.ts', 'utf8');
    expect(source).not.toMatch(/createElement\(|type=.file|input type/);
    const picked = await pickProgressPhoto('camera');
    expect(picker.requestCameraPermissionsAsync).toHaveBeenCalledOnce();
    expect(picker.launchCameraAsync).toHaveBeenCalledWith(pickerOptions);
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(manipulator.manipulateAsync).toHaveBeenCalledOnce();
    expect(picked?.previewUri).toBe('file:///var/mobile/tmp/prepared.jpg');
    expect(picked?.bytes.byteLength).toBeGreaterThan(0);
    expect(picked?.takenOn).toBe('2026-10-12');
  });

  it('chooses a photo from the library through the same native picker', async () => {
    const picked = await pickProgressPhoto('library');
    expect(picker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledOnce();
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(pickerOptions);
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    expect(picked?.previewUri).toBe('file:///var/mobile/tmp/prepared.jpg');
  });

  it('stops when the camera permission is refused', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await expect(pickProgressPhoto('camera')).rejects.toThrow('Allow the camera in Settings, then try again.');
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
  });
});
