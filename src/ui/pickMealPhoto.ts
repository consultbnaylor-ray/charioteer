import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync, requestMediaLibraryPermissionsAsync } from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { UserFacingError } from '@/domain/errors';

/** A JPEG the meal estimate can send. EXIF and location are dropped by the re-encode. */
export async function pickMealPhoto(source: 'camera' | 'library'): Promise<{ base64: string; previewUri: string } | null> {
  if (source === 'camera') {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) throw new UserFacingError('Allow the camera in Settings, then try again.', 'generic');
  } else {
    const permission = await requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new UserFacingError('Allow photo library access in Settings, then try again.', 'generic');
  }
  const result = source === 'camera'
    ? await launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
    : await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const longest = Math.max(width, height);
  const resize = longest > 1280 ? (width >= height ? { width: 1280 } : { height: 1280 }) : undefined;
  const prepared = await manipulateAsync(
    asset.uri,
    resize ? [{ resize }] : [],
    { compress: 0.7, format: SaveFormat.JPEG, base64: true },
  );
  if (!prepared.base64) throw new UserFacingError('Could not prepare that photo.', 'generic');
  if (prepared.base64.length > 6_000_000) throw new UserFacingError('That photo is still too large.', 'generic');
  return { base64: prepared.base64, previewUri: prepared.uri };
}
