import { Image, type ImageProps } from 'expo-image';
import { Pressable } from 'react-native';

import { PHOTO_RETRY, PHOTO_UNAVAILABLE } from '@/domain/ownerPhotos';
import { useSignedPhotoRetry } from '@/ui/signedPhotoRetry';
import { T } from '@/ui/ui';

/**
 * An owner photo. A failed load asks for a fresh signed URL, with a short
 * backoff, and never stops for good. After the automatic tries, the picture
 * can be asked for again.
 */
export function OwnerPhoto({
  uri,
  style,
  contentFit = 'cover',
  accessibilityLabel,
  pointerEvents,
}: {
  uri: string | null | undefined;
  style?: ImageProps['style'];
  contentFit?: ImageProps['contentFit'];
  accessibilityLabel?: string;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
}) {
  const retryState = useSignedPhotoRetry(uri);
  if (!uri) return null;
  if (retryState.gaveUp) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${PHOTO_UNAVAILABLE}. ${PHOTO_RETRY}`}
        onPress={retryState.retry}
        style={[style, { alignItems: 'center', justifyContent: 'center', padding: 8 }]}
      >
        <T variant="muted" numberOfLines={3} style={{ textAlign: 'center' }}>{PHOTO_UNAVAILABLE}</T>
        <T variant="muted" numberOfLines={1} style={{ textAlign: 'center' }}>{PHOTO_RETRY}</T>
      </Pressable>
    );
  }
  return (
    <Image
      key={retryState.mount}
      pointerEvents={pointerEvents}
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy={retryState.mount > 0 ? 'none' : 'disk'}
      accessibilityLabel={accessibilityLabel}
      accessibilityIgnoresInvertColors
      onError={retryState.onError}
    />
  );
}
