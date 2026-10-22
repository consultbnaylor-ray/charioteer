import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  type ImagePickerOptions,
} from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { isoDay } from '@/domain/dates';
import { stripJpegLocation } from '@/domain/photoLocation';
import { UserFacingError } from '@/domain/errors';
import { captureDayFromExif, PROGRESS_JPEG_QUALITY, PROGRESS_MAX_BYTES, progressResize } from '@/domain/progressPhotos';
import type { CropRect } from '@/domain/photoCrop';
import { profileSquareCrop } from '@/domain/profilePhotos';

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
  const bytes = stripJpegLocation(decodeBase64(prepared.base64));
  if (bytes.byteLength > PROGRESS_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
  return { bytes, takenOn, previewUri: prepared.uri };
}

/**
 * Centre square a profile picture opens on. The crop step can then zoom and drag.
 * A square photo returns null because the whole frame is already the picture.
 */
export function profilePictureSeed(width: number, height: number): CropRect | null {
  return profileSquareCrop(width, height);
}

/**
 * Camera or library, without the system crop UI.
 * allowsEditing cannot show a circle, and on iOS the crop is always a square, so web and
 * native both hand the original to PhotoCropper. JPEG encoding still drops EXIF and location.
 */
export async function pickProfilePhoto(source: 'camera' | 'library'): Promise<{ uri: string; width: number; height: number } | null> {
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
  let uri = asset.uri;
  let width = asset.width ?? 0;
  let height = asset.height ?? 0;
  if (width < 2 || height < 2) {
    const measured = await manipulateAsync(uri, [], { format: SaveFormat.JPEG });
    uri = measured.uri;
    width = measured.width;
    height = measured.height;
  }
  if (width < 2 || height < 2) throw new UserFacingError('Could not read that photo.', 'generic');
  return { uri, width, height };
}

/** Apply the crop from PhotoCropper and re-encode a JPEG with no location metadata. */
export async function encodeProfileCrop(
  uri: string,
  imageWidth: number,
  imageHeight: number,
  crop: CropRect,
): Promise<{ bytes: Uint8Array; previewUri: string }> {
  const whole = crop.originX === 0 && crop.originY === 0 && crop.width >= imageWidth && crop.height >= imageHeight;
  const resize = progressResize(crop.width, crop.height);
  const prepared = await manipulateAsync(
    uri,
    [...(whole ? [] : [{ crop }]), ...(resize ? [{ resize }] : [])],
    { compress: PROGRESS_JPEG_QUALITY, format: SaveFormat.JPEG, base64: true },
  );
  if (!prepared.base64) throw new UserFacingError('Could not prepare that photo.', 'generic');
  const bytes = stripJpegLocation(decodeBase64(prepared.base64));
  if (bytes.byteLength > PROGRESS_MAX_BYTES) throw new UserFacingError('That photo is still too large.', 'generic');
  return { bytes, previewUri: prepared.uri };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
