import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  type ImagePickerOptions,
} from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { isoDay } from '@/domain/dates';
import { UserFacingError } from '@/domain/errors';
import { captureDayFromExif, PROGRESS_JPEG_QUALITY, PROGRESS_MAX_BYTES, progressResize } from '@/domain/progressPhotos';
import { profileSquareCrop, type ProfilePhotoRole } from '@/domain/profilePhotos';

/** Camera or library. The capture day is read first, then a JPEG re-encode drops EXIF and location. */
export async function pickProgressPhoto(source: 'camera' | 'library'): Promise<{ bytes: Uint8Array; takenOn: string; previewUri: string } | null> {
  if (source === 'camera') {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) throw new UserFacingError('Allow the camera in Settings, then try again.', 'generic');
  } else {
    const permission = await requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new UserFacingError('Allow photo library access in Settings, then try again.', 'generic');
  }

  const options: ImagePickerOptions = { mediaTypes: ['images'], exif: true, quality: 1 };
  const result = source === 'camera'
    ? await launchCameraAsync(options)
    : await launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const takenOn = captureDayFromExif(asset.exif) ?? isoDay(new Date());
  const resize = progressResize(asset.width ?? 0, asset.height ?? 0);
  const prepared = await manipulateAsync(
    asset.uri,
    resize ? [{ resize }] : [],
    { compress: PROGRESS_JPEG_QUALITY, format: SaveFormat.JPEG, base64: true },
  );
  if (!prepared.base64) throw new UserFacingError('Could not prepare that photo.', 'generic');
  const bytes = decodeBase64(prepared.base64);
  if (bytes.byteLength > PROGRESS_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
  return { bytes, takenOn, previewUri: prepared.uri };
}

/** Camera or library. A profile picture is cropped to a square. JPEG re-encode drops EXIF and location. */
export async function pickProfilePhoto(source: 'camera' | 'library', role: ProfilePhotoRole): Promise<{ bytes: Uint8Array; previewUri: string } | null> {
  if (source === 'camera') {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) throw new UserFacingError('Allow the camera in Settings, then try again.', 'generic');
  } else {
    const permission = await requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new UserFacingError('Allow photo library access in Settings, then try again.', 'generic');
  }

  const options: ImagePickerOptions = { mediaTypes: ['images'], exif: true, quality: 1 };
  const result = source === 'camera'
    ? await launchCameraAsync(options)
    : await launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const crop = role === 'avatar' ? profileSquareCrop(width, height) : null;
  const fitted = crop ? { width: crop.width, height: crop.height } : { width, height };
  const resize = progressResize(fitted.width, fitted.height);
  const prepared = await manipulateAsync(
    asset.uri,
    [...(crop ? [{ crop }] : []), ...(resize ? [{ resize }] : [])],
    { compress: PROGRESS_JPEG_QUALITY, format: SaveFormat.JPEG, base64: true },
  );
  if (!prepared.base64) throw new UserFacingError('Could not prepare that photo.', 'generic');
  const bytes = decodeBase64(prepared.base64);
  if (bytes.byteLength > PROGRESS_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
  return { bytes, previewUri: prepared.uri };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
