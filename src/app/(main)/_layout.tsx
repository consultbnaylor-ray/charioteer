import { Stack, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_SECTIONS } from '@/domain/sections';
import { tabLabelFontSize, tabSideInset } from '@/ui/tabBar';
import { useAppTheme } from '@/ui/theme';
import { topSafeInset } from '@/ui/safeArea';
import { SectionDrawer } from '@/ui/SectionDrawer';
import { Mark, ShellInsetProvider, T, Wordmark } from '@/ui/ui';

function selected(pathname: string, href: string) {
  if (href === '/people' && pathname.startsWith('/chat')) return true;
  if (href === '/home' && (pathname === '/profile' || pathname === '/health')) return false;
  return pathname === href;
}

export default function MainLayout() {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabSide = tabSideInset(insets.left, insets.right);
  const labelSize = tabLabelFontSize(width, tabSide, theme.scale);
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (href: string) => router.navigate(href as never);

  const brand = (
    <Pressable accessibilityRole="button" accessibilityLabel="Charioteer home" onPress={() => go('/home')} style={styles.brand}>
      <Mark size={58} />
      <Wordmark size={18} />
    </Pressable>
  );

  const menuButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Menu"
      onPress={() => setMenuOpen(true)}
      style={styles.menu}
    >
      <View accessibilityElementsHidden style={styles.menuBars}>
        <View style={[styles.menuBar, { backgroundColor: theme.colors.ink }]} />
        <View style={[styles.menuBar, { backgroundColor: theme.colors.ink }]} />
        <View style={[styles.menuBar, { backgroundColor: theme.colors.ink }]} />
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: theme.colors.bg }}>
      <SectionDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      {wide ? (
        <View style={[styles.rail, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.line, paddingTop: topSafeInset(insets.top) + 8 }]}>
          {menuButton}
          {brand}
          <T variant="muted" style={{ marginTop: 4, marginBottom: 18 }}>Hold the reins.</T>
          {TAB_SECTIONS.map((tab) => (
            <NavItem key={tab.href} label={tab.tabLabel ?? tab.label} active={selected(pathname, tab.href)} onPress={() => go(tab.href)} />
          ))}
        </View>
      ) : (
        <View style={[styles.mobileTop, { paddingTop: topSafeInset(insets.top) + 8, borderBottomColor: theme.colors.line }]}>
          <View style={styles.mobileBrand}>
            {menuButton}
            {brand}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => go('/profile')}>
            <T variant="body" style={{ fontFamily: theme.font.bodyStrong }}>You</T>
          </Pressable>
        </View>
      )}
      <ShellInsetProvider top bottom={!wide}>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }} />
        </View>
      </ShellInsetProvider>
      {wide ? null : (
        <View
          style={[
            styles.tabs,
            {
              paddingBottom: Math.max(insets.bottom, 8),
              paddingLeft: tabSide,
              paddingRight: tabSide,
              borderTopColor: theme.colors.line,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          {TAB_SECTIONS.map((tab) => (
            <Pressable key={tab.href} accessibilityRole="button" accessibilityState={{ selected: selected(pathname, tab.href) }} onPress={() => go(tab.href)} style={[styles.tab, { borderTopColor: selected(pathname, tab.href) ? theme.colors.ink : 'transparent' }]}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                maxFontSizeMultiplier={1.6}
                style={{
                  width: '100%',
                  alignSelf: 'stretch',
                  textAlign: 'center',
                  color: selected(pathname, tab.href) ? theme.colors.ink : theme.colors.muted,
                  fontFamily: theme.font.bodyStrong,
                  fontSize: labelSize,
                  lineHeight: Math.round(labelSize * 1.25),
                }}
              >
                {tab.tabLabel ?? tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function NavItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.navItem, { backgroundColor: active ? theme.colors.emphasisSoft : 'transparent', borderLeftColor: active ? theme.colors.ink : 'transparent' }]}
    >
      <T variant="body" style={{ fontFamily: theme.font.bodyStrong, color: theme.colors.ink }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { width: 232, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingBottom: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  menu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuBars: { width: 18, gap: 4 },
  menuBar: { height: 2, width: 18 },
  navItem: { borderRadius: 2, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  mobileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  tabs: { flexDirection: 'row', alignItems: 'stretch', width: '100%', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: 2 },
});
