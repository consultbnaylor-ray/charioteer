import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { galleryColumnCount } from '@/domain/profilePhotos';
import { OwnerPhoto } from '@/ui/OwnerPhoto';
import { useAppTheme } from '@/ui/theme';
import { Button, T } from '@/ui/ui';

export type GalleryTile = { id: string; caption: string; uri: string | null };

export function useGalleryTileSize(): { tile: number; columns: number } {
  const { width } = useWindowDimensions();
  const columns = galleryColumnCount(width);
  const inner = Math.min(width, 760) - 40;
  const gap = 8;
  const tile = Math.max(72, Math.floor((inner - gap * (columns - 1)) / columns));
  return { tile, columns };
}

export function ProfilePhotoTiles({
  tiles,
  mode,
  selected,
  onPress,
  corner,
  ownerLinks,
}: {
  tiles: readonly GalleryTile[];
  /** Open enlarges. Select marks a photo in Edit profile. */
  mode: 'open' | 'select';
  selected?: ReadonlySet<string>;
  onPress: (id: string) => void;
  corner?: (tile: GalleryTile) => ReactNode;
  /** The signed-in person's own pictures. A failed image asks for a fresh link. */
  ownerLinks?: boolean;
}) {
  const retry = ownerLinks ?? mode === 'select';
  const { tile } = useGalleryTileSize();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {tiles.map((item) => {
        const name = item.caption.trim() || 'Public photo';
        const on = selected?.has(item.id) ?? false;
        return (
          <View key={item.id} style={{ width: tile, gap: 4 }}>
            <Pressable
              accessibilityRole={mode === 'select' ? 'checkbox' : 'button'}
              accessibilityLabel={mode === 'select' ? `Select ${name}` : `Open ${name}`}
              accessibilityState={mode === 'select' ? { checked: on } : undefined}
              onPress={() => onPress(item.id)}
              style={{ width: tile, height: tile, borderRadius: 8, overflow: 'hidden' }}
            >
              <GalleryThumb uri={item.uri} label={name} owner={retry} photoId={item.id} />
              {on ? (
                <View pointerEvents="none" style={{ position: 'absolute', left: 6, top: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,17,0.72)' }}>
                  <T style={{ color: '#F3F3EE' }}>✓</T>
                </View>
              ) : null}
            </Pressable>
            {corner ? <View style={{ position: 'absolute', top: 0, right: 0 }}>{corner(item)}</View> : null}
            {item.caption ? (
              <T variant="muted" numberOfLines={2}>{item.caption}</T>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function GalleryThumb({ uri, label, owner, photoId }: { uri: string | null; label: string; owner: boolean; photoId: string }) {
  const theme = useAppTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.sunken }]}>
      {owner ? (
        <OwnerPhoto uri={uri} photoId={photoId} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} />
      ) : uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 6 }]}>
          <T variant="muted" numberOfLines={3} style={{ textAlign: 'center', fontSize: 12, lineHeight: 15 }}>Photo</T>
        </View>
      )}
    </View>
  );
}

/** Full picture, caption, and whatever extra actions the screen needs. */
export function ProfilePhotoEnlarge({
  tile,
  onClose,
  children,
  ownerLinks = false,
}: {
  tile: GalleryTile | null;
  onClose: () => void;
  children?: ReactNode;
  /** The signed-in person's own picture. A failed image asks for a fresh link. */
  ownerLinks?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <Modal visible={tile != null} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' }}>
        <View style={{ backgroundColor: theme.colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8, maxHeight: '92%' }}>
          <View style={{ width: '100%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.colors.sunken }}>
            {tile?.uri && ownerLinks ? (
              <OwnerPhoto uri={tile.uri} photoId={tile.id} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={tile.caption || 'Public photo'} />
            ) : tile?.uri ? (
              <Image source={{ uri: tile.uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={tile.caption || 'Public photo'} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <T variant="muted">Photo</T>
              </View>
            )}
          </View>
          {tile?.caption ? <T>{tile.caption}</T> : null}
          {children}
          <Button label="Close" tone="quiet" accessibilityLabel="Close photo" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
