import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { profileInitials } from '@/domain/profilePhotos';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** Profile picture, or the person's initials when there is no photo. */
export function MemberAvatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const show = Boolean(url) && !failed;
  return (
    <View
      accessibilityLabel={`${name} profile picture`}
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
          source={{ uri: url ?? '' }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityLabel={`${name} profile picture`}
          onError={() => setFailed(true)}
        />
      ) : (
        <T variant="label" style={{ fontSize: Math.max(12, Math.round(size * 0.34)) }}>{profileInitials(name)}</T>
      )}
    </View>
  );
}
