import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';

import { useRepository } from '@/data';

/**
 * An owner photo. A failed load hides the broken image and asks for a new
 * signed URL. When that URL arrives, the picture is shown again.
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
  const repo = useRepository();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [uri]);
  if (!uri || failed) return null;
  return (
    <Image
      key={attempt}
      pointerEvents={pointerEvents}
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      accessibilityLabel={accessibilityLabel}
      accessibilityIgnoresInvertColors
      onError={() => {
        void repo.resignOwnerPhotos();
        if (attempt < 1) {
          setAttempt(1);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
