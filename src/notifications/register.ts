import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Repository } from '@/data/types';
import { buddyInviteIdFrom } from '../../supabase/functions/_shared/buddyPush';
import { connectionIdFrom } from '../../supabase/functions/_shared/messagePush';
import { MOVEMENT_REMINDER_BODY, MOVEMENT_REMINDER_TITLE } from '../../supabase/functions/_shared/motivation';

export const MOVEMENT_REMINDER_ID = 'movement-reminder';

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
 * Schedules or clears the local movement nudge. The body is generic.
 * Web has no local schedule; the saved preference still stands for a phone.
 */
export async function syncMovementReminder(on: boolean, minute: number | null): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(MOVEMENT_REMINDER_ID).catch(() => undefined);
    if (!on || minute == null) return;
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return;
    const hour = Math.floor(minute / 60);
    const rest = minute % 60;
    await Notifications.scheduleNotificationAsync({
      identifier: MOVEMENT_REMINDER_ID,
      content: {
        title: MOVEMENT_REMINDER_TITLE,
        body: MOVEMENT_REMINDER_BODY,
        data: { kind: 'movement' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: rest,
      },
    });
  } catch {
    return undefined;
  }
}

/** Opens the chat or the Buddies screen named on a notification. Does not ask for permission. */
export function listenForMessageOpens(openChat: (connectionId: string) => void, openBuddy?: () => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let remove: () => void = () => undefined;
  let cancelled = false;
  void (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      const open = (data: unknown) => {
        const id = connectionIdFrom(data);
        if (id) openChat(id);
        if (buddyInviteIdFrom(data)) openBuddy?.();
      };
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        open(response.notification.request.content.data);
      });
      remove = () => subscription.remove();
      const last = await Notifications.getLastNotificationResponseAsync();
      if (cancelled || !last) return;
      open(last.notification.request.content.data);
    } catch {
      return undefined;
    }
  })();
  return () => {
    cancelled = true;
    remove();
  };
}
