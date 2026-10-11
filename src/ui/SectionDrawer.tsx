import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRepository } from '@/data';
import { APP_SECTIONS } from '@/domain/sections';
import { useAppTheme } from '@/ui/theme';
import { Pulse, T } from '@/ui/ui';

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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
            <T variant="title">Menu</T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={onClose}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <T variant="body">Close</T>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            {APP_SECTIONS.map((section) => {
              const active = section.href !== '' && (pathname === section.href || (section.href === '/people' && pathname.startsWith('/chat')));
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
                    {section.icon === 'pulse' ? <Pulse color={section.sos ? theme.colors.danger : theme.colors.ink} /> : null}
                    <T
                      variant="body"
                      style={{
                        color: section.sos ? theme.colors.danger : theme.colors.ink,
                        fontFamily: theme.font.bodyStrong,
                      }}
                    >
                      {section.label}
                    </T>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </View>
    </Modal>
  );
}
