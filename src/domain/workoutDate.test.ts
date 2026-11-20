import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { shiftDay } from '@/domain/healthInsights';
import { workoutDayFromPicker, workoutPickerDate } from '@/domain/workoutDate';

describe('workout date', () => {
  it('uses one day for the week strip and the month calendar, including a past day', () => {
    const picked = workoutPickerDate('2026-11-16');
    expect(workoutDayFromPicker(picked)).toBe('2026-11-16');
    expect(workoutDayFromPicker(workoutPickerDate(shiftDay('2026-11-21', 7)))).toBe('2026-11-28');
    expect(workoutDayFromPicker(new Date(2026, 10, 21, 18, 30))).toBe('2026-11-21');
  });

  it('keeps the week strip and the session date on the same selected day, and does not block past days', () => {
    const calendar = readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8');
    const field = readFileSync('src/ui/DateField.tsx', 'utf8');
    expect(calendar).not.toContain('const [day, setDay]');
    expect(calendar).toContain('value={workoutPickerDate(selected)}');
    expect(calendar).toContain('setSelected(workoutDayFromPicker(value))');
    expect(calendar).toContain('unrestricted');
    expect(calendar).not.toContain('earliestDate');
    expect(field).toContain('unrestricted');
    const week = calendar.slice(calendar.indexOf('Previous week'), calendar.indexOf('New session'));
    expect(week).toContain('setSelected');
    expect(week).not.toContain('setDay');
  });
});
