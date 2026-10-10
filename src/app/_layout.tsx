import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { SourceSans3_400Regular, SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { RepoProvider, useSnapshot } from '@/data';
import { ThemeProvider, useAppTheme } from '@/ui/theme';
import { Mark, T } from '@/ui/ui';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Fraunces_600SemiBold,
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
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
    <ThemeProvider preference={snap.profile?.themePreference ?? 'system'} textScale={snap.profile?.textScale ?? 'default'}>
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
    if (Platform.OS === 'web') {
      document.title = 'Charioteer';
      document.body.style.backgroundColor = theme.colors.bg;
    }
  }, [theme.colors.bg]);

  useEffect(() => {
    if (!snap.ready) return;
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
        <Mark />
        <T variant="title">Charioteer</T>
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
