/** Private gratitude diary. A catalogue of helpers shared by the app and Thumos. */

export const GRATITUDE_CATEGORIES = ['People', 'Health', 'Progress', 'Small joys', 'Nature', 'Other'] as const;

export type GratitudeCategory = (typeof GRATITUDE_CATEGORIES)[number];

export type GratitudePhoto = {
  id: string;
  entryId: string;
  storagePath: string;
  createdAt: string;
  previewUrl: string | null;
  /** Public line under a shared photo. There is no private note on these photos. */
  caption: string;
};

export type GratitudeEntry = {
  id: string;
  body: string;
  category: GratitudeCategory | null;
  isFavourite: boolean;
  /** Local calendar day, YYYY-MM-DD. */
  entryDate: string;
  createdAt: string;
  updatedAt: string;
  photos: GratitudePhoto[];
  /** Set when the line was saved with a check-in. Editing either side uses this row. */
  checkInId?: string | null;
};

export type GratitudeReflect = { comment: string; suggestions: string[] };

const BODY_LIMIT = 1000;
const SUGGESTION_LIMIT = 80;

export function isGratitudeCategory(value: string | null | undefined): value is GratitudeCategory {
  return GRATITUDE_CATEGORIES.some((item) => item === value);
}

export function planGratitudeEntry(
  body: string,
  entryDate: string,
  today: string,
): { ok: true; body: string; entryDate: string } | { ok: false; message: string } {
  const text = body.trim();
  if (!text) return { ok: false, message: 'Write a line first.' };
  if (text.length > BODY_LIMIT) return { ok: false, message: 'Keep it to 1,000 characters.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { ok: false, message: 'Choose a date.' };
  if (entryDate > today) return { ok: false, message: 'The date cannot be in the future.' };
  return { ok: true, body: text, entryDate };
}

/** A running total, never a streak. */
export function gratitudeCountLabel(count: number): string {
  if (count <= 0) return 'Nothing recorded yet. Add your first line below.';
  if (count === 1) return 'You have recorded 1 thing to be grateful for so far';
  return `You have recorded ${count} things to be grateful for so far`;
}

function byNewest(a: GratitudeEntry, b: GratitudeEntry): number {
  if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export function sortGratitude(entries: readonly GratitudeEntry[]): GratitudeEntry[] {
  return [...entries].sort(byNewest);
}

export function filterGratitude(
  entries: readonly GratitudeEntry[],
  options: { query?: string; category?: GratitudeCategory | null; favouritesOnly?: boolean },
): GratitudeEntry[] {
  const query = (options.query ?? '').trim().toLowerCase();
  return sortGratitude(entries).filter((entry) => {
    if (options.favouritesOnly && !entry.isFavourite) return false;
    if (options.category && entry.category !== options.category) return false;
    if (!query) return true;
    const haystack = `${entry.body} ${entry.category ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function groupGratitudeByDay(entries: readonly GratitudeEntry[]): { entryDate: string; entries: GratitudeEntry[] }[] {
  const groups: { entryDate: string; entries: GratitudeEntry[] }[] = [];
  for (const entry of sortGratitude(entries)) {
    const last = groups[groups.length - 1];
    if (!last || last.entryDate !== entry.entryDate) groups.push({ entryDate: entry.entryDate, entries: [entry] });
    else last.entries.push(entry);
  }
  return groups;
}

export type ResurfacedGratitude = { entry: GratitudeEntry; kind: 'on-this-day' | 'a-while-ago' };

/** An older line to meet again. Today's entries are left in the list. */
export function resurfaceGratitude(entries: readonly GratitudeEntry[], today: string): ResurfacedGratitude | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const monthDay = today.slice(5);
  const onThisDay = sortGratitude(entries).filter((entry) => entry.entryDate.slice(5) === monthDay && entry.entryDate < today);
  if (onThisDay.length) return { entry: onThisDay[onThisDay.length - 1], kind: 'on-this-day' };
  const older = sortGratitude(entries).filter((entry) => entry.entryDate <= shiftIsoDay(today, -14));
  if (!older.length) return null;
  return { entry: older[older.length - 1], kind: 'a-while-ago' };
}

function shiftIsoDay(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

/** Starred lines first, then recent ones, at most five. Used only when AI consent is on. */
export function gratitudeForThumos(entries: readonly GratitudeEntry[], limit = 5): GratitudeEntry[] {
  const cap = Math.min(5, Math.max(0, limit));
  const starred = sortGratitude(entries.filter((entry) => entry.isFavourite)).slice(0, 3);
  const seen = new Set(starred.map((entry) => entry.id));
  const picked = [...starred];
  for (const entry of sortGratitude(entries)) {
    if (picked.length >= cap) break;
    if (seen.has(entry.id)) continue;
    picked.push(entry);
    seen.add(entry.id);
  }
  return picked.slice(0, cap);
}

/** Text only. Photo paths, links, and bytes are never included. */
export function formatGratitudeContext(entries: readonly GratitudeEntry[]): string {
  const lines = gratitudeForThumos(entries);
  if (!lines.length) return '';
  const rows = lines.map((entry) => {
    const tag = entry.category ? `, ${entry.category}` : '';
    const star = entry.isFavourite ? ', favourite' : '';
    return `- ${entry.entryDate}${tag}${star}: ${entry.body.trim().slice(0, 240)}`;
  });
  return `Gratitude diary (private; newest and starred):\n${rows.join('\n')}`;
}

export const GRATITUDE_PROMPT_LINE = 'If CONTEXT includes a gratitude diary, you may remind them of one real entry on a hard or craving day, in their words, such as "Last week you wrote that you are grateful for...". Never invent a diary line. Never criticise a gap between entries. The diary is private and is not for the community.';

/** The model sees this one line and an optional tag. Nothing else from the account. */
export function gratitudeReflectMessages(body: string, category: string | null): { system: string; user: string } {
  const line = body.trim();
  const tag = category && isGratitudeCategory(category) ? category : null;
  return {
    system: [
      'You write a short warm note about one gratitude diary line.',
      'UK English. Two to four sentences on why this line matters.',
      'Then two or three related positive things they might also notice. Each suggestion is under 80 characters, concrete, and kind.',
      'Do not mention alcohol, relapse, or shame. Do not ask for other personal information. Do not refer to anything that is not in the diary line.',
      'Reply as JSON only: {"comment":"...","suggestions":["...","..."]}',
    ].join(' '),
    user: tag ? `Category: ${tag}\n${line}` : line,
  };
}

export function parseGratitudeReflect(raw: string): GratitudeReflect | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as { comment?: unknown; suggestions?: unknown };
  const comment = typeof record.comment === 'string' ? record.comment.trim() : '';
  if (!comment || comment.length > 600) return null;
  if (!Array.isArray(record.suggestions)) return null;
  const suggestions = record.suggestions
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= SUGGESTION_LIMIT)
    .slice(0, 3);
  if (suggestions.length < 2) return null;
  return { comment, suggestions };
}

export function sameGratitudeBody(a: string, b: string): boolean {
  const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalise(a) === normalise(b);
}

export function gratitudeFromRows(rows: unknown): GratitudeEntry[] {
  if (!Array.isArray(rows)) return [];
  const entries: GratitudeEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = record.id == null ? '' : String(record.id);
    const body = typeof record.body === 'string' ? record.body : '';
    if (!id || !body) continue;
    const rawCategory = typeof record.category === 'string' ? record.category : null;
    entries.push({
      id,
      body,
      category: isGratitudeCategory(rawCategory) ? rawCategory : null,
      isFavourite: record.is_favourite === true,
      entryDate: String(record.entry_date ?? '').slice(0, 10),
      createdAt: String(record.created_at ?? ''),
      updatedAt: String(record.updated_at ?? ''),
      photos: [],
      checkInId: typeof record.check_in_id === 'string' && record.check_in_id ? record.check_in_id : null,
    });
  }
  return entries;
}

export function localGratitudeReflect(body: string, category: string | null): GratitudeReflect {
  const line = body.trim().replace(/\s+/g, ' ');
  const short = line.length > 80 ? `${line.slice(0, 77)}…` : line;
  const tag = category && isGratitudeCategory(category) ? category : null;
  return {
    comment: `That line matters because you noticed it. ${tag ? `${tag} is part of the life you are keeping. ` : ''}You can come back to “${short}” on a harder day.`,
    suggestions: [
      'The next small moment like this one',
      tag === 'People' ? 'Someone who made today easier' : 'A person who was kind today',
      'Something ordinary that still felt good',
    ],
  };
}
