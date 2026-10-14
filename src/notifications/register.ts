import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Repository } from '@/data/types';
import { connectionIdFrom } from '../../supabase/functions/_shared/messagePush';
import { MOVEMENT_REMINDER_BODY, MOVEMENT_REMINDER_TITLE } from '../../supabase/functions/_shared/motivation';

export const MOVEMENT_REMINDER_ID = 'movement-reminder';

type TokenStore = Pick<Repository, 'saveDeviceToken'>;

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromExtra = extra?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra) return fromExtra;
  const fromEas = Constants.easConfig?.projectId;
  return typeof fromEas === 'string' && fromEas ? fromEas : null;
}

/**
 * Asks for notification permission and stores the Expo push token.
 * Call this when Community is turned on, or when a chat opens. Not at launch.
 */
export async function offerMessageNotifications(repo: TokenStore): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');
    if (!Device.isDevice) return;
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return;
    const id = projectId();
    const token = id
      ? await Notifications.getExpoPushTokenAsync({ projectId: id })
      : await Notifications.getExpoPushTokenAsync();
    if (!token.data) return;
    await repo.saveDeviceToken(token.data, Platform.OS);
  } catch {
    return undefined;
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

/** Opens the chat named on a notification. Does not ask for permission. */
export function listenForMessageOpens(openChat: (connectionId: string) => void): () => void {
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
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const id = connectionIdFrom(response.notification.request.content.data);
        if (id) openChat(id);
      });
      remove = () => subscription.remove();
      const last = await Notifications.getLastNotificationResponseAsync();
      if (cancelled || !last) return;
      const id = connectionIdFrom(last.notification.request.content.data);
      if (id) openChat(id);
    } catch {
      return undefined;
    }
  })();
  return () => {
    cancelled = true;
    remove();
  };
}
