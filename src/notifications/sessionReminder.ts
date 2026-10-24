import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { PlannedSession } from '@/domain/plannedSession';
import { reportNotificationFailure } from '@/notifications/register';
import {
  DEFAULT_WORKOUT_REMINDERS,
  parseWorkoutReminders,
  reminderFires,
  reminderIdentifier,
  WORKOUT_REMINDERS_KEY,
  type ReminderOffset,
  type WorkoutReminderSetting,
} from '@/domain/workoutReminders';

export async function loadWorkoutReminders(): Promise<WorkoutReminderSetting> {
  try {
    return parseWorkoutReminders(await AsyncStorage.getItem(WORKOUT_REMINDERS_KEY));
  } catch {
    return { ...DEFAULT_WORKOUT_REMINDERS, offsets: [] };
  }
}

export async function saveWorkoutReminders(setting: WorkoutReminderSetting): Promise<void> {
  try {
    await AsyncStorage.setItem(WORKOUT_REMINDERS_KEY, JSON.stringify(setting));
  } catch {
    // The choice still applies for this visit when storage is unavailable.
  }
}

/**
 * Asks only when the master switch is turned on.
 * Web has no notification sheet, so the setting can still be stored there.
 */
export async function ensureReminderPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return true;
  try {
    const Notifications = await import('expo-notifications');
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === 'granted';
  } catch (error) {
    await reportNotificationFailure(error);
    return false;
  }
}

async function scheduledSessionIds(): Promise<string[]> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return [];
  const Notifications = await import('expo-notifications');
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .filter((item) => item.content.data?.kind === 'session')
    .map((item) => item.identifier);
}

/** Drops every local workout reminder. Message alerts are remote and are left alone. */
export async function cancelWorkoutReminders(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const Notifications = await import('expo-notifications');
    const ids = await scheduledSessionIds();
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  } catch (error) {
    await reportNotificationFailure(error);
  }
}

/**
 * Cancels the local workout reminders, then schedules one per future session and offset.
 * An off switch leaves none. Nothing is sent to the server.
 */
export async function rescheduleWorkoutReminders(
  sessions: readonly PlannedSession[],
  setting: WorkoutReminderSetting,
  now = new Date(),
): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    await cancelWorkoutReminders();
    const fires = reminderFires(sessions, setting, now);
    if (!fires.length) return;
    const Notifications = await import('expo-notifications');
    await Promise.all(fires.map((fire) => Notifications.scheduleNotificationAsync({
      identifier: fire.identifier,
      content: {
        title: fire.title,
        body: fire.body,
        data: { kind: 'session', sessionId: fire.sessionId, offset: fire.offset satisfies ReminderOffset },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire.at },
    })));
  } catch (error) {
    await reportNotificationFailure(error);
  }
}

export async function cancelSessionReminder(sessionId: string): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const Notifications = await import('expo-notifications');
    const offsets: ReminderOffset[] = ['1d', '1h', '30m'];
    await Promise.all(offsets.map((offset) => Notifications.cancelScheduledNotificationAsync(reminderIdentifier(sessionId, offset)).catch((error: unknown) => {
      void reportNotificationFailure(error);
    })));
  } catch (error) {
    await reportNotificationFailure(error);
  }
}
