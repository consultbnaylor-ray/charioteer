import { Stack, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSnapshot } from '@/data';
import { incomingRequestCount, peopleTabAccessibilityLabel, peopleTabBadgeCount, requestBadgeText } from '@/domain/connections';
import { messageUnreadTotal } from '@/domain/liveChat';
import { useChatRead } from '@/ui/chatRead';
import { TAB_SECTIONS, type AppSection } from '@/domain/sections';
import { tabLabelFontSize, tabSideInset } from '@/ui/tabBar';
import { useAppTheme } from '@/ui/theme';
import { topSafeInset } from '@/ui/safeArea';
import { MessageNotificationPrompt } from '@/ui/MessageNotificationPrompt';
import { SectionDrawer } from '@/ui/SectionDrawer';
import { HeaderShareButton } from '@/ui/SharePhotoCard';
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
  const snap = useSnapshot();
  const meId = snap.profile?.id;
  const { marks: readMarks, ready: readsReady } = useChatRead(meId);
  const requestCount = meId ? incomingRequestCount(snap.connections, meId) : 0;
  const messageUnread = meId && readsReady
    ? messageUnreadTotal(
      snap.messages ?? [],
      snap.connections.filter((connection) => connection.status === 'accepted').map((connection) => connection.id),
      meId,
      readMarks,
    )
    : 0;
  const peopleBadge = requestBadgeText(peopleTabBadgeCount(requestCount, messageUnread));

  const go = (href: string) => router.dismissTo(href as never);
  const tabName = (tab: AppSection) => (tab.href === '/people' ? peopleTabAccessibilityLabel(requestCount, messageUnread) : tab.tabLabel ?? tab.label);

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
          <HeaderShareButton />
          {brand}
          <T variant="muted" style={{ marginTop: 4, marginBottom: 18 }}>Hold the reins.</T>
          {TAB_SECTIONS.map((tab) => (
            <NavItem
              key={tab.href}
              label={tab.tabLabel ?? tab.label}
              badge={tab.href === '/people' ? peopleBadge : null}
              accessibilityLabel={tabName(tab)}
              active={selected(pathname, tab.href)}
              onPress={() => go(tab.href)}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.mobileTop, { paddingTop: topSafeInset(insets.top) + 8, borderBottomColor: theme.colors.line }]}>
          <View style={styles.mobileBrand}>
            {menuButton}
            {brand}
            <HeaderShareButton />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => go('/profile')}>
            <T variant="body" style={{ fontFamily: theme.font.bodyStrong }}>You</T>
          </Pressable>
        </View>
      )}
      <ShellInsetProvider top bottom={!wide}>
        <View style={{ flex: 1 }}>
          {snap.profile ? <MessageNotificationPrompt userId={snap.profile.id} /> : null}
          <View style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
              <Stack.Screen
                name="chat/[id]"
                dangerouslySingular={(_name, params) => {
                  const raw = params?.id;
                  const id = Array.isArray(raw) ? raw[0] : raw;
                  return typeof id === 'string' && id ? `chat/${id}` : undefined;
                }}
              />
            </Stack>
          </View>
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
            <Pressable
              key={tab.href}
              accessibilityRole="button"
              accessibilityLabel={tabName(tab)}
              accessibilityState={{ selected: selected(pathname, tab.href) }}
              onPress={() => go(tab.href)}
              style={[styles.tab, { borderTopColor: selected(pathname, tab.href) ? theme.colors.ink : 'transparent' }]}
            >
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
              {tab.href === '/people' && peopleBadge ? <RequestBadge label={peopleBadge} /> : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function NavItem({
  label,
  badge,
  accessibilityLabel,
  active,
  onPress,
}: {
  label: string;
  badge: string | null;
  accessibilityLabel: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.navItem, { backgroundColor: active ? theme.colors.emphasisSoft : 'transparent', borderLeftColor: active ? theme.colors.ink : 'transparent' }]}
    >
      <T variant="body" style={{ fontFamily: theme.font.bodyStrong, color: theme.colors.ink }}>{label}</T>
      {badge ? <RequestBadge label={badge} /> : null}
    </Pressable>
  );
}

function RequestBadge({ label }: { label: string }) {
  const theme = useAppTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.badge, { backgroundColor: theme.colors.dangerFill }]}>
      <Text style={{ color: theme.colors.dangerInk, fontFamily: theme.font.bodyStrong, fontSize: 11, lineHeight: 14 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: 232, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingBottom: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  menu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuBars: { width: 18, gap: 4 },
  menuBar: { height: 2, width: 18 },
  navItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 2, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  mobileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  tabs: { flexDirection: 'row', alignItems: 'stretch', width: '100%', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: 2 },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
});
