import { SESSION_TYPE_LABEL, type PlannedSession, type PlannedSessionType } from '@/domain/plannedSession';
import { offsetLeadMs, REMINDER_OFFSETS, type WorkoutReminderSetting } from '@/domain/workoutReminders';

/** Minutes before the start. Negative, which is what the system sheet expects. */
export type CalendarAlarmInput = {
  relativeOffset: number;
};

/**
 * The only fields handed to the system add-event sheet.
 * No notes, location, or health figures.
 */
export type CalendarEventInput = {
  title: string;
  startDate: Date;
  endDate: Date;
  alarms?: CalendarAlarmInput[];
};

const HEALTH_WORDS = /heart|hrv|vo2|calorie|weight|sleep|steps|stress|battery|bpm|mood|body fat|lean mass|waist/i;

export function workoutCalendarTitle(sessionType: PlannedSessionType): string {
  return `Charioteer: ${SESSION_TYPE_LABEL[sessionType]}`;
}

/**
 * Title, start, and end from the plan. An alert is included only when workout
 * reminders are on, and only as a lead time. The session note and effort stay out.
 */
export function workoutCalendarEventInput(
  session: Pick<PlannedSession, 'sessionType' | 'startsAt' | 'durationMinutes'>,
  reminders: WorkoutReminderSetting | null,
): CalendarEventInput | null {
  const startMs = Date.parse(session.startsAt);
  const minutes = session.durationMinutes;
  if (!Number.isFinite(startMs) || !Number.isFinite(minutes) || minutes <= 0) return null;
  const input: CalendarEventInput = {
    title: workoutCalendarTitle(session.sessionType),
    startDate: new Date(startMs),
    endDate: new Date(startMs + minutes * 60 * 1000),
  };
  const alarms = calendarAlarms(reminders);
  if (alarms.length) input.alarms = alarms;
  return input;
}

function calendarAlarms(setting: WorkoutReminderSetting | null): CalendarAlarmInput[] {
  if (!setting?.on) return [];
  return REMINDER_OFFSETS.filter((offset) => setting.offsets.includes(offset)).map((offset) => ({
    relativeOffset: -offsetLeadMs(offset) / 60_000,
  }));
}

/** True when the sheet payload itself carries a health word. Dates are not text. */
export function calendarEventHasHealthData(input: CalendarEventInput): boolean {
  const text = [input.title, ...(input.alarms ?? []).map((alarm) => String(alarm.relativeOffset))].join('\n');
  return HEALTH_WORDS.test(text);
}

function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** A calendar file for the browser. Same title, start, end, and alerts. No notes. */
export function workoutCalendarIcs(input: CalendarEventInput, uid = 'charioteer-workout', stamp = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Charioteer//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${icsText(uid)}`,
    `DTSTAMP:${icsStamp(stamp)}`,
    `DTSTART:${icsStamp(input.startDate)}`,
    `DTEND:${icsStamp(input.endDate)}`,
    `SUMMARY:${icsText(input.title)}`,
  ];
  for (const alarm of input.alarms ?? []) {
    const minutes = Math.abs(Math.round(alarm.relativeOffset));
    lines.push('BEGIN:VALARM', `TRIGGER:-PT${minutes}M`, 'ACTION:DISPLAY', `DESCRIPTION:${icsText(input.title)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
