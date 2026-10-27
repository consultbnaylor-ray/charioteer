/**
 * Typed distance and time for the route planner.
 * A positive finite value is kept. There is no upper bound.
 * The field length limit is only so a huge paste cannot freeze the screen.
 */

export const OWN_CHOICE_LABEL = 'Your own';

export const OWN_KM_LABEL = 'Kilometres';

export const OWN_KM_HINT = 'Kilometres, such as 12.5.';

export const OWN_HOURS_LABEL = 'Hours';

export const OWN_MINUTES_LABEL = 'Minutes';

export const OWN_TIME_HINT = 'Minutes, or hours and minutes.';

export const OWN_NUMBER_HINT = 'Enter a number above 0.';

export function ownTimeHint(hoursRaw: string, minutesRaw: string): string {
  const typed = hoursRaw.trim() || minutesRaw.trim();
  if (typed && parseOwnDuration(hoursRaw, minutesRaw) == null) return OWN_NUMBER_HINT;
  return OWN_TIME_HINT;
}

/** Stops a million-digit paste. 300 and much larger values still fit. */
export const OWN_ENTRY_MAX_CHARS = 40;

/** Kilometres of text become metres. Unreadable or non-positive text is unset. */
export function parseOwnKilometres(raw: string): number | null {
  const text = stripUnit(raw, /\s*(km|kilometres|kilometers|kilometre|kilometer)\s*$/i);
  const km = parseDecimal(text);
  if (km == null || km <= 0) return null;
  const metres = Math.round(km * 1000);
  return metres >= 1 ? metres : null;
}

/**
 * Hours and minutes, or one field that holds minutes, `1:30`, or `1h 30`.
 * Both empty is unset. The result is whole minutes, with no upper bound.
 */
export function parseOwnDuration(hoursRaw: string, minutesRaw: string): number | null {
  const hours = hoursRaw.trim();
  const minutes = minutesRaw.trim();
  if (!hours && !minutes) return null;
  if (!hours) return parseDurationText(minutes);
  if (!minutes) return looksLikeDuration(hours) ? parseDurationText(hours) : hoursToMinutes(hours);
  const hourCount = parseDecimal(hours);
  const minuteCount = parseDecimal(stripUnit(minutes, /\s*(m|min|mins|minute|minutes)\s*$/i));
  if (hourCount == null || minuteCount == null || hourCount < 0 || minuteCount < 0) return null;
  const total = Math.round(hourCount * 60 + minuteCount);
  return total >= 1 ? total : null;
}

function hoursToMinutes(raw: string): number | null {
  const hours = parseDecimal(raw);
  if (hours == null || hours <= 0) return null;
  const total = Math.round(hours * 60);
  return total >= 1 ? total : null;
}

function parseDurationText(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text || /e/i.test(text)) return null;
  const clock = /^(\d+):(\d{1,2})$/.exec(text);
  if (clock) {
    const hourCount = Number(clock[1]);
    const minuteCount = Number(clock[2]);
    if (minuteCount >= 60) return null;
    const total = hourCount * 60 + minuteCount;
    return total >= 1 ? total : null;
  }
  const words = /^(\d+)\s*(?:h|hr|hrs|hour|hours)(?:\s*(\d+)\s*(?:m|min|mins|minute|minutes)?)?$/.exec(text);
  if (words) {
    const hourCount = Number(words[1]);
    const minuteCount = words[2] != null ? Number(words[2]) : 0;
    const total = hourCount * 60 + minuteCount;
    return total >= 1 ? total : null;
  }
  const plain = stripUnit(text, /\s*(m|min|mins|minute|minutes)\s*$/i);
  const value = parseDecimal(plain);
  if (value == null || value <= 0) return null;
  const rounded = Math.round(value);
  return rounded >= 1 ? rounded : null;
}

function looksLikeDuration(text: string): boolean {
  return /:|(?:h|hr|hrs|hour|hours|min|mins|minute|minutes)\b/i.test(text);
}

function stripUnit(raw: string, unit: RegExp): string {
  return raw.trim().replace(unit, '').trim();
}

/** One decimal separator. A comma is a decimal mark unless groups of three make it thousands. */
function parseDecimal(raw: string): number | null {
  let text = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!text || /e/i.test(text)) return null;
  if (text.startsWith('+')) text = text.slice(1);
  if (!text || text.startsWith('-')) return null;
  const normalised = normaliseSeparators(text);
  if (normalised == null || !/^(\d+(\.\d+)?|\.\d+)$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

function normaliseSeparators(text: string): string | null {
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalAt = Math.max(lastComma, lastDot);
    const thousands = text[decimalAt] === ',' ? '.' : ',';
    const groups = text.slice(0, decimalAt).split(thousands);
    const fraction = text.slice(decimalAt + 1);
    if (groups.length < 2 || groups.slice(1).some((group) => group.length !== 3)) return null;
    if (!groups.every((group) => /^\d+$/.test(group)) || !/^\d+$/.test(fraction)) return null;
    return `${groups.join('')}.${fraction}`;
  }
  if (lastComma >= 0) return splitMark(text, ',');
  if (lastDot >= 0) return splitMark(text, '.');
  return /^\d+$/.test(text) ? text : null;
}

function splitMark(text: string, mark: ',' | '.'): string | null {
  const parts = text.split(mark);
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  if (parts.length > 2 && parts.slice(1).every((part) => part.length === 3)) return parts.join('');
  if (parts.length === 2) return `${parts[0]}.${parts[1]}`;
  return null;
}
