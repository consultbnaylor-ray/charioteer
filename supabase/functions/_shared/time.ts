/** Calendar helpers in UTC so streaks do not flicker across time zones. */

export function addMonthsUtc(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  const cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(day, lastDay));
  cursor.setUTCHours(hours, minutes, seconds, ms);
  return cursor;
}

export function addYearsUtc(date: Date, years: number): Date {
  return addMonthsUtc(date, years * 12);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return isoDate(a) === isoDate(b);
}
