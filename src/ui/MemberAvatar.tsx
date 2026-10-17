import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRepository } from '@/data';
import type { DirectoryCard } from '@/data/types';
import { PHOTO_RETRY, PHOTO_UNAVAILABLE } from '@/domain/ownerPhotos';
import { profileInitials } from '@/domain/profilePhotos';
import { useSignedPhotoRetry } from '@/ui/signedPhotoRetry';
import { useAppTheme } from '@/ui/theme';

/** Profile picture, or one centred initial when there is no photo. */
export function MemberAvatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const theme = useAppTheme();
  const retryState = useSignedPhotoRetry(url);
  const show = Boolean(url) && !retryState.gaveUp;
  const failed = Boolean(url) && retryState.gaveUp;
  const fontSize = Math.round(size * 0.38);
  const lineHeight = Math.round(size * 0.44);
  const initial = (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.5}
      maxFontSizeMultiplier={1}
      style={{
        width: Math.round(size * 0.72),
        textAlign: 'center',
        fontFamily: theme.font.bodyStrong,
        fontSize,
        lineHeight,
        color: theme.colors.ink,
        includeFontPadding: false,
      }}
    >
      {profileInitials(name)}
    </Text>
  );
  return (
    <View
      accessibilityLabel={failed ? undefined : `${name} profile picture`}
      accessible={!failed}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.sunken,
      }}
    >
      {show ? (
        <Image
          key={retryState.mount}
          source={{ uri: url ?? '' }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy={retryState.mount > 0 ? 'none' : 'disk'}
          accessibilityLabel={`${name} profile picture`}
          onError={retryState.onError}
        />
      ) : failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${PHOTO_UNAVAILABLE}. ${PHOTO_RETRY}`}
          onPress={retryState.retry}
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
        >
          {initial}
        </Pressable>
      ) : initial}
    </View>
  );
}

/** Fresh links last a minute, so ask again a little before they run out. */
const AVATAR_REFRESH_MS = 45_000;

/**
 * Signed profile picture links for member rows (Discover, Requests, Chats, chat header).
 * The links in the snapshot are signed for 60 seconds when it loads, so by the
 * time a list is opened they have usually expired and the row fell back to the
 * initial. This asks profile-photo-url again when the screen opens, the same
 * way the full profile does, and refreshes while it stays open.
 */
export function useMemberAvatars(cards: DirectoryCard[]): (userId: string) => string | null {
  const repo = useRepository();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = useMemo(
    () => [...new Set(cards.map((card) => card.avatarPhotoId).filter((id): id is string => Boolean(id)))].sort().join(','),
    [cards],
  );

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    let live = true;
    const load = () => {
      void repo.profilePhotoUrls(ids).then((rows) => {
        if (!live) return;
        const next: Record<string, string> = {};
        for (const row of rows) next[row.id] = row.url;
        setUrls(next);
      }).catch(() => undefined);
    };
    load();
    const timer = setInterval(load, AVATAR_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [repo, key]);

  return (userId: string) => {
    const card = cards.find((item) => item.id === userId);
    if (!card) return null;
    return (card.avatarPhotoId && urls[card.avatarPhotoId]) || card.avatarUrl || null;
  };
}
