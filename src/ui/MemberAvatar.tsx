import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { profileInitials } from '@/domain/profilePhotos';
import { useAppTheme } from '@/ui/theme';

/** Profile picture, or one centred initial when there is no photo. */
export function MemberAvatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const show = Boolean(url) && !failed;
  const fontSize = Math.round(size * 0.38);
  const lineHeight = Math.round(size * 0.44);
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
      )}
    </View>
  );
}
