import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRepository } from '@/data';
import { APP_SECTIONS, MENU_GROUPS, menuSectionActive, type AppSection } from '@/domain/sections';
import { CloseMark, MenuGlyph } from '@/ui/menuIcons';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const PANEL_WIDTH = 320;

export function SectionDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const repo = useRepository();
  const pathname = usePathname();
  const translate = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      translate.setValue(-PANEL_WIDTH);
      Animated.timing(translate, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(translate, { toValue: -PANEL_WIDTH, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [open, translate]);

  function go(href: string) {
    onClose();
    router.navigate(href as never);
  }

  function row(section: AppSection) {
    const active = menuSectionActive(pathname, section.href);
    const color = section.sos ? theme.colors.danger : theme.colors.ink;
    return (
      <Pressable
        key={section.id}
        accessibilityRole="button"
        accessibilityLabel={section.label}
        accessibilityState={{ selected: active }}
        onPress={() => {
          if (section.signOut) {
            onClose();
            void repo.signOut();
            return;
          }
          go(section.href);
        }}
        style={{
          minHeight: 44,
          justifyContent: 'center',
          paddingHorizontal: 12,
          marginBottom: 4,
          borderLeftWidth: 3,
          borderLeftColor: active ? theme.colors.ink : 'transparent',
          backgroundColor: active ? theme.colors.emphasisSoft : 'transparent',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <MenuGlyph name={section.icon} color={color} />
          <T
            variant="body"
            style={{
              flex: 1,
              color,
              fontFamily: theme.font.bodyStrong,
            }}
          >
            {section.label}
          </T>
        </View>
      </Pressable>
    );
  }

  const tail = APP_SECTIONS.filter((section) => !section.group);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Animated.View
          style={{
            width: PANEL_WIDTH,
            backgroundColor: theme.colors.bg,
            transform: [{ translateX: translate }],
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 12),
            borderRightWidth: 1,
            borderRightColor: theme.colors.line,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8 }}>
            <T variant="title" style={{ flex: 1 }}>Menu</T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={onClose}
              style={{ width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}
            >
              <CloseMark color={theme.colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            {MENU_GROUPS.map((group, index) => (
              <View key={group.id}>
                {index === 0 ? <View style={{ height: 8 }} /> : (
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.line, marginHorizontal: 12, marginTop: 10, marginBottom: 8 }} />
                )}
                <T variant="label" style={{ paddingHorizontal: 12, marginBottom: 4 }}>{group.label}</T>
                {APP_SECTIONS.filter((section) => section.group === group.id).map(row)}
              </View>
            ))}
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.line, marginHorizontal: 12, marginTop: 10, marginBottom: 8 }} />
            {tail.map(row)}
          </ScrollView>
        </Animated.View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss menu" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </View>
    </Modal>
  );
}
