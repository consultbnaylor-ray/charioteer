import { Stack, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/ui/theme';
import { Mark, T } from '@/ui/ui';

const TABS = [
  { href: '/home', label: 'Today' },
  { href: '/check-in', label: 'Check-in' },
  { href: '/breathe', label: 'Breathe' },
  { href: '/thumos', label: 'Thumos' },
  { href: '/people', label: 'People' },
  { href: '/library', label: 'Library' },
] as const;

function selected(pathname: string, href: string) {
  if (href === '/people' && pathname.startsWith('/chat')) return true;
  if (href === '/home' && (pathname === '/profile' || pathname === '/health')) return false;
  return pathname === href;
}

export default function MainLayout() {
  const theme = useAppTheme();
  const wide = useWindowDimensions().width >= 980;
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const go = (href: string) => router.push(href as never);

  const brand = (
    <Pressable accessibilityRole="button" accessibilityLabel="Charioteer home" onPress={() => go('/home')} style={styles.brand}>
      <Mark />
      <T variant="title" style={{ fontSize: 22 * theme.scale }}>Charioteer</T>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: theme.colors.bg }}>
      {wide ? (
        <View style={[styles.rail, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.line, paddingTop: insets.top + 18 }]}>
          {brand}
          <T variant="muted" style={{ marginTop: 4, marginBottom: 18 }}>Hold the reins.</T>
          {TABS.map((tab) => (
            <NavItem key={tab.href} label={tab.label} active={selected(pathname, tab.href)} onPress={() => go(tab.href)} />
          ))}
          <View style={{ flex: 1 }} />
          <NavItem label="Health" active={pathname === '/health'} onPress={() => go('/health')} />
          <NavItem label="You" active={pathname === '/profile'} onPress={() => go('/profile')} />
        </View>
      ) : (
        <View style={[styles.mobileTop, { paddingTop: insets.top + 8, borderBottomColor: theme.colors.line }]}>
          {brand}
          <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => go('/profile')}>
            <T variant="body" style={{ fontFamily: theme.font.bodyStrong }}>You</T>
          </Pressable>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }} />
      </View>
      {wide ? null : (
        <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 8), borderTopColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
          {TABS.map((tab) => (
            <Pressable key={tab.href} accessibilityRole="button" accessibilityState={{ selected: selected(pathname, tab.href) }} onPress={() => go(tab.href)} style={styles.tab}>
              <T
                variant="muted"
                style={{
                  color: selected(pathname, tab.href) ? theme.colors.copper : theme.colors.muted,
                  fontFamily: theme.font.bodyStrong,
                  fontSize: 12 * theme.scale,
                  textAlign: 'center',
                }}
              >
                {tab.label}
              </T>
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
      style={[styles.navItem, { backgroundColor: active ? theme.colors.copperSoft : 'transparent' }]}
    >
      <T variant="body" style={{ fontFamily: theme.font.bodyStrong, color: active ? theme.colors.copper : theme.colors.ink }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { width: 232, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingBottom: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  navItem: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  mobileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
