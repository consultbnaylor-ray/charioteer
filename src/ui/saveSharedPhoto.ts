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
