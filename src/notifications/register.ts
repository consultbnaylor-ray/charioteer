import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Repository } from '@/data/types';
import { buddyInviteIdFrom } from '../../supabase/functions/_shared/buddyPush';
import { connectionIdFrom } from '../../supabase/functions/_shared/messagePush';

type TokenStore = Pick<Repository, 'saveDeviceToken'>;

/** Shown when the phone token cannot be saved. Permission denied stays quiet. */
export const MESSAGE_TOKEN_ERROR = "Couldn't register for message notifications – Try again";

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromExtra = extra?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra) return fromExtra;
  const fromEas = Constants.easConfig?.projectId;
  return typeof fromEas === 'string' && fromEas ? fromEas : null;
}

async function currentPushToken(): Promise<string | null> {
  const Notifications = await import('expo-notifications');
  const id = projectId();
  const token = id
    ? await Notifications.getExpoPushTokenAsync({ projectId: id })
    : await Notifications.getExpoPushTokenAsync();
  return token.data || null;
}

/**
 * Asks for notification permission and stores the Expo push token.
 * The first signed-in launch explains this first. Community and an open chat can still ask.
 * Returns a line to show when saving the token fails.
 */
export async function offerMessageNotifications(repo: TokenStore): Promise<string | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');
    if (!Device.isDevice) return null;
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return null;
    const token = await currentPushToken();
    if (!token) return null;
    await repo.saveDeviceToken(token, Platform.OS);
    return null;
  } catch (error) {
    console.error('message notifications', error);
    return MESSAGE_TOKEN_ERROR;
  }
}

/**
 * Stores a fresh token when permission is already granted. Does not ask.
 * Runs on every launch and whenever the app comes back to the foreground.
 */
export async function retryMessageNotifications(repo: TokenStore): Promise<string | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');
    if (!Device.isDevice) return null;
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status !== 'granted') return null;
    const token = await currentPushToken();
    if (!token) return null;
    await repo.saveDeviceToken(token, Platform.OS);
    return null;
  } catch (error) {
    console.error('message notifications', error);
    return MESSAGE_TOKEN_ERROR;
  }
}

/**
 * Drops local schedules left by an older build.
 * A planned-session reminder (data.kind === 'session') stays.
 * Direct messages are remote pushes and are not in this list.
 * Does not ask for permission and does not create a new schedule.
 */
export async function cancelScheduledNotifications(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const Notifications = await import('expo-notifications');
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const kept = scheduled.filter((item) => item.content.data?.kind === 'session');
    if (kept.length === 0) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }
    await Promise.all(
      scheduled
        .filter((item) => item.content.data?.kind !== 'session')
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );
  } catch {
    return undefined;
  }
}

/** Opens the chat or the Buddies screen named on a notification. Does not ask for permission. */
export function listenForMessageOpens(
  openChat: (connectionId: string) => void,
  openBuddy?: () => void,
  isReady: () => boolean = () => true,
): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let remove: () => void = () => undefined;
  let wait: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;
  const seen = new Set<string>();
  const queued: unknown[] = [];

  const open = (data: unknown) => {
    try {
      const id = connectionIdFrom(data);
      if (id) openChat(id);
      if (buddyInviteIdFrom(data)) openBuddy?.();
    } catch (error) {
      console.error('message open', error);
    }
  };

  void (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;
      const clearLast = () => {
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      };
      const flush = () => {
        if (cancelled || !isReady()) return;
        const batch = queued.splice(0, queued.length);
        for (const data of batch) open(data);
        if (batch.length) clearLast();
      };
      const arm = () => {
        if (wait || cancelled) return;
        wait = setInterval(() => {
          if (cancelled) {
            if (wait) clearInterval(wait);
            wait = null;
            return;
          }
          if (!isReady()) return;
          if (wait) clearInterval(wait);
          wait = null;
          flush();
        }, 50);
      };
      const take = (data: unknown, key: string) => {
        if (seen.has(key)) return;
        seen.add(key);
        if (!isReady()) {
          queued.push(data);
          arm();
          return;
        }
        open(data);
        clearLast();
      };
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const key = response.notification.request.identifier || 'tap';
        take(response.notification.request.content.data, key);
      });
      remove = () => subscription.remove();
      const last = await Notifications.getLastNotificationResponseAsync();
      if (cancelled || !last) return;
      const key = last.notification.request.identifier || 'last';
      take(last.notification.request.content.data, key);
    } catch {
      return undefined;
    }
  })();
  return () => {
    cancelled = true;
    if (wait) clearInterval(wait);
    remove();
  };
}

/**
 * Reloads when a direct-message push arrives while the app is open.
 * Does not ask for permission, does not open a screen, and ignores other alerts.
 */
export function listenForIncomingMessages(onMessage: () => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let remove: () => void = () => undefined;
  let cancelled = false;
  void (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;
      const subscription = Notifications.addNotificationReceivedListener((notification) => {
        if (!connectionIdFrom(notification.request.content.data)) return;
        onMessage();
      });
      remove = () => subscription.remove();
    } catch (error) {
      console.error('message arrival', error);
    }
  })();
  return () => {
    cancelled = true;
    remove();
  };
}

/** iOS home-screen badge. The number is unread direct messages. Zero clears it. */
export async function setAppIconBadge(count: number): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const Notifications = await import('expo-notifications');
    const next = Number.isFinite(count) ? Math.max(0, Math.min(99, Math.floor(count))) : 0;
    await Notifications.setBadgeCountAsync(next);
  } catch (error) {
    console.error('app badge', error);
  }
}
