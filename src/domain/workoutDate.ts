import { isoDay, parseIsoDay, startOfLocalDay } from '@/domain/dates';

/**
 * The workout week strip and the month calendar share one calendar day.
 * A date chosen on either control is this ISO day. Past days stay available.
 */
export function workoutDayFromPicker(date: Date): string {
  return isoDay(startOfLocalDay(date));
}

/** The Date the month calendar shows for the week strip's selected day. */
export function workoutPickerDate(iso: string): Date {
  return parseIsoDay(iso);
}
