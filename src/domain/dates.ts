/** Calendar days are local. Instants are full ISO timestamps. Neither formatter returns ISO. */

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseIsoDay(isoDayValue: string): Date {
  const [year, month, day] = isoDayValue.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function clampToPast(date: Date, now = new Date()): Date {
  const today = startOfLocalDay(now);
  const chosen = startOfLocalDay(date);
  return chosen.getTime() > today.getTime() ? today : chosen;
}

function asDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseIsoDay(value);
  return new Date(value);
}

/** 10 October 2026 */
export function formatUkLong(value: Date | string): string {
  return asDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Sat 10 Oct 2026. Parts are joined so the comma from some Intl builds does not appear. */
export function formatUkDate(value: Date | string): string {
  const date = asDate(value);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = date.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const year = date.toLocaleDateString('en-GB', { year: 'numeric' });
  return `${weekday} ${day} ${month} ${year}`;
}

/** 10/10/2026 */
export function formatUkCompact(value: Date | string): string {
  return asDate(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Sat 10 Oct 2026, 18:05 */
export function formatUkWhen(value: Date | string): string {
  const date = asDate(value);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${formatUkDate(date)}, ${time}`;
}
