import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calendarEventHasHealthData, workoutCalendarEventInput, workoutCalendarIcs } from '@/domain/calendarEvent';
import type { PlannedSession } from '@/domain/plannedSession';

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(path);
  }
  return found;
}

function session(patch: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: 'session-1',
    sessionType: 'outdoor',
    startsAt: '2026-10-25T14:00:00.000Z',
    durationMinutes: 30,
    note: 'heart rate 140 and weight 80kg',
    plannedEffort: 'easy',
    doneAt: null,
    ...patch,
  };
}

describe('workout calendar event', () => {
  it('builds a title, start, and end, and leaves health data out', () => {
    const input = workoutCalendarEventInput(session(), { on: true, offsets: ['1d', '30m'] });
    expect(input).not.toBeNull();
    expect(input?.title).toBe('Charioteer: Run/Walk (outdoor)');
    expect(input?.startDate.toISOString()).toBe('2026-10-25T14:00:00.000Z');
    expect(input?.endDate.toISOString()).toBe('2026-10-25T14:30:00.000Z');
    expect(input?.alarms).toEqual([{ relativeOffset: -1440 }, { relativeOffset: -30 }]);
    expect(Object.keys(input ?? {}).sort()).toEqual(['alarms', 'endDate', 'startDate', 'title']);
    expect(calendarEventHasHealthData(input!)).toBe(false);
    expect(JSON.stringify(input)).not.toMatch(/heart rate|weight|80kg|easy|note/i);

    const quiet = workoutCalendarEventInput(session({ sessionType: 'boxing', durationMinutes: 45 }), { on: false, offsets: ['1h'] });
    expect(quiet?.title).toBe('Charioteer: Boxing');
    expect(quiet?.endDate.toISOString()).toBe('2026-10-25T14:45:00.000Z');
    expect(quiet).not.toHaveProperty('alarms');
    expect(workoutCalendarEventInput(session(), null)).not.toHaveProperty('alarms');
    expect(workoutCalendarEventInput(session(), { on: true, offsets: [] })).not.toHaveProperty('alarms');
    expect(workoutCalendarEventInput(session({ startsAt: 'not-a-time' }), null)).toBeNull();
    expect(workoutCalendarEventInput(session({ durationMinutes: 0 }), null)).toBeNull();
  });

  it('writes the same facts into a calendar file, with no event notes', () => {
    const input = workoutCalendarEventInput(session(), { on: true, offsets: ['30m'] });
    const ics = workoutCalendarIcs(input!, 'session-1', new Date('2026-10-25T06:00:00.000Z'));
    const event = ics.slice(ics.indexOf('BEGIN:VEVENT'), ics.indexOf('BEGIN:VALARM'));
    expect(ics).toContain('SUMMARY:Charioteer: Run/Walk (outdoor)');
    expect(ics).toContain('DTSTART:20261025T140000Z');
    expect(ics).toContain('DTEND:20261025T143000Z');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(event).not.toContain('DESCRIPTION');
    expect(ics).not.toMatch(/heart rate|weight|80kg|easy|NOTE|LOCATION/i);
    expect(calendarEventHasHealthData(input!)).toBe(false);
  });

  it('uses the system add-event sheet and does not request calendar permission', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8')) as {
      expo: { ios: { buildNumber: string }; plugins: unknown[] };
    };
    const presenter = readFileSync('src/ui/addToCalendar.ts', 'utf8');
    const screen = readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8');
    const calendar = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-calendar') as
      | [string, { calendarPermission?: string; remindersPermission?: string | false }]
      | undefined;
    expect(app.expo.ios.buildNumber).toBe('68');
    expect(calendar?.[1]).toEqual({
      calendarPermission: "Charioteer only opens Apple's add-event sheet when you tap Add to Calendar. It never reads your calendar.",
      remindersPermission: false,
    });
    expect(JSON.stringify(app)).not.toMatch(/NSReminders|READ_CALENDAR|WRITE_CALENDAR|Allow \$\(PRODUCT_NAME\) to access your/);
    expect(presenter).toContain("import('expo-calendar/legacy')");
    expect(presenter).toContain('createEventInCalendarAsync(input)');
    expect(presenter).not.toMatch(/requestCalendarPermissions|getEventsAsync|getCalendars|notes:/);
    expect(screen).toContain('>Add to Calendar</T>');
    expect(screen).toContain('presentSessionEvent');
    expect(screen).toContain('workoutCalendarEventInput');
    expect(screen).not.toMatch(/requestCalendarPermissions|getEventsAsync|NSCalendars/);
    expect(sourceFiles('src').filter((file) => !file.endsWith('.test.ts') && readFileSync(file, 'utf8').includes('requestCalendarPermissions'))).toEqual([]);
  });
});
