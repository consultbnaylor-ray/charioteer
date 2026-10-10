import { Oswald_700Bold } from '@expo-google-fonts/oswald';
import { Barlow_400Regular, Barlow_400Regular_Italic, Barlow_600SemiBold } from '@expo-google-fonts/barlow';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { RepoProvider, useSnapshot } from '@/data';
import { font, ThemeProvider, useAppTheme } from '@/ui/theme';
import { Mark, T, Wordmark } from '@/ui/ui';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

let handledResetUrl: string | null = null;

export default function RootLayout() {
  const [loaded, error] = useFonts({
    [font.display]: Oswald_700Bold,
    [font.body]: Barlow_400Regular,
    [font.bodyItalic]: Barlow_400Regular_Italic,
    [font.bodyStrong]: Barlow_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <RepoProvider>
        <ThemedShell />
      </RepoProvider>
    </SafeAreaProvider>
  );
}

function ThemedShell() {
  const snap = useSnapshot();
  return (
    <ThemeProvider preference={snap.profile?.themePreference ?? 'dark'} textScale={snap.profile?.textScale ?? 'default'}>
      <Chrome />
    </ThemeProvider>
  );
}

function Chrome() {
  const theme = useAppTheme();
  const snap = useSnapshot();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Charioteer';
      document.body.style.backgroundColor = theme.colors.bg;
    }
  }, [theme.colors.bg]);

  useEffect(() => {
    const openReset = (url: string | null) => {
      if (!url || !url.includes('set-password') || handledResetUrl === url) return;
      handledResetUrl = url;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname.includes('set-password')) return;
      router.replace('/set-password');
    };
    void Linking.getInitialURL().then(openReset);
    const subscription = Linking.addEventListener('url', (event) => openReset(event.url));
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (!snap.ready) return;
    if (pathname === '/set-password') return;
    const authed = Boolean(snap.session);
    const onboarded = Boolean(snap.profile?.onboardingComplete);
    const authRoute = pathname === '/sign-in' || pathname === '/sign-up';
    const onboarding = pathname === '/onboarding';
    if (!authed) {
      if (!authRoute) router.replace('/sign-in');
      return;
    }
    if (!onboarded) {
      if (!onboarding) router.replace('/onboarding');
      return;
    }
    if (authRoute || onboarding || pathname === '/') router.replace('/home');
  }, [snap.ready, snap.session, snap.profile?.onboardingComplete, pathname, router]);

  if (!snap.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Mark size={120} />
        <Wordmark size={28} />
        <T variant="muted">Opening your day…</T>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }} />
    </>
  );
}
