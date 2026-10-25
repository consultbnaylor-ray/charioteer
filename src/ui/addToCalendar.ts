import { Platform } from 'react-native';

import { workoutCalendarIcs, type CalendarEventInput } from '@/domain/calendarEvent';

/**
 * Opens Apple's add-event sheet on iPhone (EventKitUI via
 * expo-calendar/legacy createEventInCalendarAsync). That call does not ask
 * for calendar permission and does not read events. The browser downloads
 * the same event as a file. Anything else is treated as unavailable.
 */
export async function presentSessionEvent(input: CalendarEventInput): Promise<'added' | 'dismissed' | 'file'> {
  if (Platform.OS === 'web') {
    downloadCalendarFile(workoutCalendarIcs(input));
    return 'file';
  }
  const Calendar = await import('expo-calendar/legacy');
  const result = await Calendar.createEventInCalendarAsync(input);
  return result?.action === 'done' ? 'added' : 'dismissed';
}

function downloadCalendarFile(ics: string): void {
  if (typeof document === 'undefined') throw new Error('unavailable');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'charioteer-workout.ics';
  anchor.click();
  URL.revokeObjectURL(url);
}
