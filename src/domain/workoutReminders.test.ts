import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { PlannedSession } from './plannedSession';
import {
  DEFAULT_WORKOUT_REMINDERS,
  parseWorkoutReminders,
  reminderFires,
  reminderIdentifier,
  reminderSettingWords,
  sessionHasReminder,
} from './workoutReminders';

function session(partial: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    sessionType: 'boxing',
    startsAt: '2026-10-21T17:00:00.000Z',
    durationMinutes: 45,
    note: '',
    doneAt: null,
    ...partial,
  };
}

describe('workout reminders', () => {
  const now = new Date('2026-10-20T09:00:00.000Z');

  it('stays off until the master switch is stored on', () => {
    expect(DEFAULT_WORKOUT_REMINDERS).toEqual({ on: false, offsets: [] });
    expect(parseWorkoutReminders(null)).toEqual({ on: false, offsets: [] });
    expect(parseWorkoutReminders('nope')).toEqual({ on: false, offsets: [] });
    expect(parseWorkoutReminders(JSON.stringify({ on: true, offsets: ['1d', 'start', '30m'] }))).toEqual({
      on: true,
      offsets: ['1d', '30m'],
    });
    expect(reminderSettingWords({ on: false, offsets: ['1d'] })).toBe('Reminders off');
    expect(reminderSettingWords({ on: true, offsets: [] })).toBe('Reminders on');
    expect(reminderSettingWords({ on: true, offsets: ['30m', '1d', '1h'] })).toBe('Reminders on: 1 day, 1 hour, 30 min before');
  });

  it('schedules one future line per offset and drops the rest', () => {
    const setting = { on: true, offsets: ['1d', '1h', '30m'] as const };
    const fires = reminderFires([session()], { on: true, offsets: [...setting.offsets] }, now);
    expect(fires.map((fire) => fire.offset)).toEqual(['1d', '1h', '30m']);
    expect(fires[0]?.at.toISOString()).toBe('2026-10-20T17:00:00.000Z');
    expect(fires[1]?.at.toISOString()).toBe('2026-10-21T16:00:00.000Z');
    expect(fires[2]?.at.toISOString()).toBe('2026-10-21T16:30:00.000Z');
    expect(new Set(fires.map((fire) => fire.body)).size).toBe(3);
    expect(fires.map((fire) => fire.identifier)).toEqual([
      reminderIdentifier(session().id, '1d'),
      reminderIdentifier(session().id, '1h'),
      reminderIdentifier(session().id, '30m'),
    ]);
    for (const fire of fires) {
      expect(fire.title).toBe('Planned session');
      expect(fire.body).not.toMatch(/mood|weight|vo2|calorie|sober|craving|body fat|heart rate/i);
      expect(fire.body.length).toBeGreaterThan(10);
    }
    expect(sessionHasReminder(session(), { on: true, offsets: ['1d', '1h', '30m'] }, now)).toBe(true);
    expect(reminderFires([session()], { on: false, offsets: ['1d', '1h', '30m'] }, now)).toEqual([]);
    expect(reminderFires([session({ doneAt: '2026-10-20T08:00:00.000Z' })], { on: true, offsets: ['1h'] }, now)).toEqual([]);
    expect(reminderFires([session()], { on: true, offsets: ['1d'] }, new Date('2026-10-20T18:00:00.000Z'))).toEqual([]);
    expect(reminderFires([session({ startsAt: '2026-10-20T08:00:00.000Z' })], { on: true, offsets: ['30m'] }, now)).toEqual([]);
  });

  it('keeps session reminders out of the launch wipe and off the server', () => {
    const register = readFileSync('src/notifications/register.ts', 'utf8');
    const cancel = register.slice(register.indexOf('export async function cancelScheduledNotifications'), register.indexOf('export function listenForMessageOpens'));
    expect(cancel).toContain('cancelAllScheduledNotificationsAsync');
    expect(cancel).toContain("kind === 'session'");
    expect(cancel).not.toContain('requestPermissionsAsync');
    expect(register).not.toContain('scheduleNotificationAsync');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    expect(layout).not.toContain('scheduleNotificationAsync');
    expect(layout).not.toContain('requestPermissionsAsync');
    const scheduler = readFileSync('src/notifications/sessionReminder.ts', 'utf8');
    expect(scheduler).toContain('scheduleNotificationAsync');
    expect(scheduler).toContain("kind: 'session'");
    expect(scheduler).toContain('requestPermissionsAsync');
    expect(scheduler).not.toContain('saveDeviceToken');
    const screen = readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8');
    expect(screen).toContain('Workout reminders');
    expect(screen).toContain('reminderSettingWords');
    expect(screen).toContain('ensureReminderPermission');
    expect(screen).not.toContain('scheduleNotificationAsync');
    expect(readFileSync('src/app/(main)/notifications.tsx', 'utf8')).not.toContain('Movement reminder');
  });
});
