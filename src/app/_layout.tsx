import Constants from 'expo-constants';
import { Oswald_700Bold } from '@expo-google-fonts/oswald';
import { Barlow_400Regular, Barlow_400Regular_Italic, Barlow_600SemiBold } from '@expo-google-fonts/barlow';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { APP_DISPLAY_NAME, APP_FULL_NAME } from '@/domain/appName';
import { buddySecretFromUrl, holdBuddySecret, peekBuddySecret, consumeBuddySecret } from '@/domain/buddies';
import { garminReturnFromUrl, holdOnboardingGarminStep, noteGarminAppReturn } from '@/domain/garminConnect';
import { RepoProvider, useRepository, useSnapshot } from '@/data';
import { catchUpAppleHealthReads } from '@/health/catchUp';
import { bindNotificationErrorLog, cancelScheduledNotifications, listenForIncomingMessages, listenForMessageOpens, retryMessageNotifications, setAppIconBadge } from '@/notifications/register';
import { messageUnreadTotal } from '@/domain/liveChat';
import { useChatRead } from '@/ui/chatRead';
import { CONSENT_VERSION } from '@/data/catalogue';
import { clientAppBuild } from '@/domain/clientError';
import { hasCurrentConsents } from '@/domain/consents';
import { installFatalHandler, uploadStoredFatal } from '@/domain/fatalError';
import { font, ThemeProvider, useAppTheme } from '@/ui/theme';
import { topSafeInset } from '@/ui/safeArea';
import { KeyboardDoneBar } from '@/ui/keyboard';
import { RootErrorBoundary } from '@/ui/RootErrorBoundary';
import { Mark, T, Wordmark } from '@/ui/ui';

installFatalHandler();

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
    <RootErrorBoundary>
      <RepoProvider>
        <ThemedShell />
      </RepoProvider>
    </RootErrorBoundary>
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
  const repo = useRepository();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = APP_DISPLAY_NAME;
      document.body.style.backgroundColor = theme.colors.bg;
    }
  }, [theme.colors.bg]);

  const navigationReady = useRef(false);
  const stackMounted = useRef(false);
  const pathnameRef = useRef(pathname);
  const onboardedRef = useRef(Boolean(snap.profile?.onboardingComplete));
  const readyRef = useRef(snap.ready);
  const pendingGarmin = useRef<'connected' | 'cancelled' | null>(null);
  navigationReady.current = snap.ready;
  pathnameRef.current = pathname;
  onboardedRef.current = Boolean(snap.profile?.onboardingComplete);
  readyRef.current = snap.ready;

  const sendGarminReturn = useCallback((outcome: 'connected' | 'cancelled') => {
    noteGarminAppReturn(outcome);
    if (!readyRef.current) {
      pendingGarmin.current = outcome;
      return;
    }
    pendingGarmin.current = null;
    const stayOnOnboarding = pathnameRef.current === '/onboarding' || !onboardedRef.current;
    if (stayOnOnboarding) {
      holdOnboardingGarminStep();
      return;
    }
    router.push(`/profile?garmin=${outcome === 'connected' ? 'connected' : 'cancelled'}` as never);
  }, [router]);

  useEffect(() => listenForMessageOpens((connectionId) => {
    try {
      void repo.reloadMessages().catch((error: unknown) => console.error(error));
      router.push(`/chat/${connectionId}` as never);
    } catch (error) {
      console.error('message open', error);
    }
  }, () => {
    try {
      router.push('/buddies' as never);
    } catch (error) {
      console.error('message open', error);
    }
  }, () => navigationReady.current && stackMounted.current, () => {
    try {
      router.push('/shared-photos' as never);
    } catch (error) {
      console.error('message open', error);
    }
  }), [router, repo]);

  useEffect(() => {
    if (!snap.ready || !snap.session) return;
    void uploadStoredFatal(repo, clientAppBuild({
      buildNumber: Constants.expoConfig?.ios?.buildNumber,
      version: Constants.expoConfig?.version,
    }));
  }, [repo, snap.ready, snap.session]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !snap.ready || !snap.session || !snap.profile?.consentHealth) return;
    void catchUpAppleHealthReads(repo).catch((error: unknown) => console.error('apple health reads', error));
  }, [repo, snap.profile?.consentHealth, snap.ready, snap.session]);

  useEffect(() => {
    bindNotificationErrorLog(repo);
    void cancelScheduledNotifications();
    const registerPhone = () => {
      void retryMessageNotifications(repo).then((message) => {
        if (message) console.error(message);
      }).catch((error: unknown) => console.error('message notifications', error));
    };
    registerPhone();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void repo.reloadMessages().catch((error: unknown) => console.error(error));
      void repo.resignOwnerPhotos();
      registerPhone();
      if (Platform.OS === 'ios') {
        void catchUpAppleHealthReads(repo).then((result) => {
          if (result.error) console.error('apple health reads', result.error);
        }).catch((error: unknown) => console.error('apple health reads', error));
      }
    });
    const arrivals = listenForIncomingMessages(() => {
      void repo.reloadMessages().catch((error: unknown) => console.error(error));
    });
    const timer = setInterval(() => {
      void repo.refreshOwnerPhotosIfStale();
    }, 60_000);
    return () => {
      subscription.remove();
      arrivals();
      clearInterval(timer);
    };
  }, [repo]);

  useEffect(() => {
    const openReset = (url: string | null) => {
      const secret = url ? buddySecretFromUrl(url) : null;
      if (secret) {
        holdBuddySecret(secret);
        router.push(`/buddies?token=${encodeURIComponent(secret)}` as never);
      }
      const garmin = url ? garminReturnFromUrl(url) : null;
      if (garmin) sendGarminReturn(garmin);
      if (!url || !url.includes('set-password') || handledResetUrl === url) return;
      handledResetUrl = url;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname.includes('set-password')) return;
      router.replace('/set-password');
    };
    void Linking.getInitialURL().then(openReset);
    const subscription = Linking.addEventListener('url', (event) => openReset(event.url));
    return () => subscription.remove();
  }, [router, sendGarminReturn]);

  useEffect(() => {
    if (!snap.ready || !pendingGarmin.current) return;
    sendGarminReturn(pendingGarmin.current);
  }, [pathname, sendGarminReturn, snap.profile?.onboardingComplete, snap.ready]);

  useEffect(() => {
    if (!snap.ready) return;
    if (pathname === '/set-password') return;
    const authed = Boolean(snap.session);
    const onboarded = Boolean(snap.profile?.onboardingComplete);
    const consentDue = onboarded && !hasCurrentConsents(snap.consents, CONSENT_VERSION);
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
    if (consentDue) {
      if (pathname !== '/consent') router.replace('/consent');
      return;
    }
    if (pathname.startsWith('/buddies')) consumeBuddySecret();
    const buddySecret = peekBuddySecret();
    if (buddySecret) {
      consumeBuddySecret();
      router.replace(`/buddies?token=${encodeURIComponent(buddySecret)}` as never);
      return;
    }
    if (authRoute || onboarding || pathname === '/consent' || pathname === '/') router.replace('/home');
  }, [snap.ready, snap.session, snap.profile?.onboardingComplete, snap.consents, pathname, router]);

  if (!snap.ready) {
    return <OpeningDay background={theme.colors.bg} />;
  }

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <MessageIconBadge />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }} />
      <NoteStackMounted flag={stackMounted} />
      <KeyboardDoneBar />
    </>
  );
}

/** Sets the iOS icon badge to the unread direct-message count, and clears it when those are read. */
function MessageIconBadge() {
  const snap = useSnapshot();
  const meId = snap.profile?.id ?? null;
  const { marks, ready } = useChatRead(meId);
  const count = meId && ready
    ? messageUnreadTotal(
      snap.messages ?? [],
      (snap.connections ?? []).filter((connection) => connection.status === 'accepted').map((connection) => connection.id),
      meId,
      marks,
    )
    : 0;
  useEffect(() => {
    if (!snap.ready) return;
    if (!snap.session || !meId) {
      void setAppIconBadge(0);
      return;
    }
    if (!ready) return;
    void setAppIconBadge(count);
  }, [snap.ready, snap.session, meId, ready, count]);
  return null;
}

/** Marks the root stack as committed so a cold-start message tap can navigate. */
function NoteStackMounted({ flag }: { flag: { current: boolean } }) {
  useEffect(() => {
    flag.current = true;
    return () => {
      flag.current = false;
    };
  }, [flag]);
  return null;
}

function OpeningDay({ background }: { background: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: background, alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: topSafeInset(insets.top) }}>
      <Mark size={120} />
      <Wordmark size={28} />
      <T variant="muted">{APP_FULL_NAME}</T>
      <T variant="muted">Opening your day…</T>
    </View>
  );
}
