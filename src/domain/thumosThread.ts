import { formatUkLong, isoDay } from './dates';

/** A bubble past this many lines is truncated until More. */
export const THUMOS_LINE_CAP = 6;

/**
 * Rough line count for a bubble about 80% of a phone width at 15px.
 * 32 characters is a narrow phone, so a message that is long there is long everywhere.
 */
export function messageNeedsMore(text: string, charsPerLine = 32): boolean {
  if (!text.trim()) return false;
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    const length = paragraph.trim().length;
    lines += length === 0 ? 1 : Math.ceil(length / charsPerLine);
  }
  return lines > THUMOS_LINE_CAP;
}

type ThreadRow = { role: string; content: string };

/**
 * The open screen shows one message, normally Thumos’s latest reply.
 * While a send from this visit is still on screen, that user message stays up with the reply.
 * Pass null once the screen is opened again.
 */
export function visibleThumos<T extends ThreadRow>(messages: readonly T[], sentText: string | null): { visible: T[]; earlier: T[] } {
  if (sentText) {
    let start = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user' && messages[index].content === sentText) {
        start = index;
        break;
      }
    }
    if (start === -1) return { visible: [], earlier: [...messages] };
    return { visible: messages.slice(start), earlier: messages.slice(0, start) };
  }
  if (messages.length === 0) return { visible: [], earlier: [] };
  return { visible: [messages[messages.length - 1]], earlier: messages.slice(0, -1) };
}

/** Sunday 11 October 2026. Weekday and date are joined so a comma is not inserted. */
export function thumosDayLabel(createdAt: string): string {
  const date = new Date(createdAt);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  return `${weekday} ${formatUkLong(date)}`;
}

export type ThumosDayGroup<T> = { day: string; heading: string; messages: T[] };

/** Earlier messages, oldest day first. Messages inside a day stay in thread order. */
export function groupThumosByDay<T extends { createdAt: string }>(messages: readonly T[]): ThumosDayGroup<T>[] {
  const groups: ThumosDayGroup<T>[] = [];
  for (const message of messages) {
    const day = isoDay(new Date(message.createdAt));
    const last = groups[groups.length - 1];
    if (!last || last.day !== day) groups.push({ day, heading: thumosDayLabel(message.createdAt), messages: [message] });
    else last.messages.push(message);
  }
  return groups;
}
