import { Image, type ImageProps } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { PHOTO_LOADING, PHOTO_RETRY, PHOTO_UNAVAILABLE, signedPhotoCacheKey } from '@/domain/ownerPhotos';
import { useSignedPhotoRetry } from '@/ui/signedPhotoRetry';
import { T } from '@/ui/ui';

/**
 * An owner photo. The cache key is the photo id, so a new signed link is still
 * the same picture. A loaded photo stays when the screen scrolls or redraws.
 */
export function OwnerPhoto({
  uri,
  photoId,
  signWhenMissing = false,
  style,
  contentFit = 'cover',
  accessibilityLabel,
  pointerEvents,
}: {
  uri: string | null | undefined;
  photoId?: string | null;
  /** Ask for a link when this picture has none yet. Avatars do not use this. */
  signWhenMissing?: boolean;
  style?: ImageProps['style'];
  contentFit?: ImageProps['contentFit'];
  accessibilityLabel?: string;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
}) {
  const retryState = useSignedPhotoRetry(uri, { signWhenMissing });
  const shown = retryState.displayUri;
  const cacheKey = signedPhotoCacheKey(shown, photoId);
  const source = useMemo(() => (shown ? { uri: shown, cacheKey } : null), [shown, cacheKey]);
  if (!uri && !signWhenMissing && !shown) return null;
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
    <View style={style}>
      {retryState.loaded ? null : (
        <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <T variant="muted" numberOfLines={2} style={{ textAlign: 'center' }}>{PHOTO_LOADING}</T>
        </View>
      )}
      {source ? (
        <Image
          key={retryState.loaded ? cacheKey : `${cacheKey}:${retryState.reload}`}
          pointerEvents={pointerEvents}
          source={source}
          recyclingKey={cacheKey}
          style={retryState.loaded ? style : { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          accessibilityLabel={accessibilityLabel}
          accessibilityIgnoresInvertColors
          onLoad={retryState.onLoad}
          onError={retryState.onError}
        />
      ) : null}
    </View>
  );
}
