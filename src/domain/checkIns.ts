import { isoDay } from './dates';

export type CheckInPoint = {
  mood: number;
  craving: number;
  createdAt: string;
};

export type CheckInDay = {
  day: string;
  label: string;
  mood: number | null;
  craving: number | null;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Seven local days ending today. The newest check-in on a day replaces an earlier one. */
export function recentCheckInDays(checkIns: CheckInPoint[], today: Date): CheckInDay[] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days: CheckInDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset);
    days.push({
      day: isoDay(date),
      label: WEEKDAYS[date.getDay()],
      mood: null,
      craving: null,
    });
  }
  const indexByDay = new Map(days.map((day, index) => [day.day, index]));
  const latestAt = new Map<string, string>();
  for (const item of checkIns) {
    const key = isoDay(new Date(item.createdAt));
    const index = indexByDay.get(key);
    if (index == null) continue;
    const previous = latestAt.get(key);
    if (previous != null && previous >= item.createdAt) continue;
    latestAt.set(key, item.createdAt);
    days[index] = { ...days[index], mood: item.mood, craving: item.craving };
  }
  return days;
}
