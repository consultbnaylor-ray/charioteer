import { Platform } from 'react-native';

import { SAVE_PHOTOS_USAGE } from '@/domain/sharedPhotos';

export { SAVE_PHOTOS_USAGE };

/**
 * Asked only when someone taps Save to Photos. The true argument is add-only:
 * iOS Add Photos Only, and on Android it does not request a library read.
 * Named-album lookup is not used here. On this SDK that lookup checks for
 * full library access, which would read the person's other photos.
 */
export async function requestAddOnlyPhotoSave(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web') return 'unavailable';
  const { requestPermissionsAsync } = await import('expo-media-library');
  const result = await requestPermissionsAsync(true);
  return result.granted ? 'granted' : 'denied';
}

/** Adds the JPEG to the library. A signed https link is saved as a local file first. Does not create a named album, because that needs a library read. */
export async function saveJpegToLibrary(uri: string): Promise<'saved' | 'denied' | 'unavailable'> {
  const permission = await requestAddOnlyPhotoSave();
  if (permission !== 'granted') return permission;
  const local = await localJpeg(uri);
  const { saveToLibraryAsync } = await import('expo-media-library');
  await saveToLibraryAsync(local);
  return 'saved';
}

async function localJpeg(uri: string): Promise<string> {
  if (!/^https:\/\//i.test(uri)) return uri;
  const FileSystem = await import('expo-file-system/legacy');
  const dest = `${FileSystem.cacheDirectory}shared-photo-${Date.now()}.jpg`;
  const downloaded = await FileSystem.downloadAsync(uri, dest);
  return downloaded.uri;
}
