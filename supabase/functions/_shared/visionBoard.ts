/**
 * A private photo board of the life someone wants. Captions and the statement
 * may be read by Thumos when coach consent is on. The pictures are never sent.
 */

export const VISION_BUCKET = 'vision-board';
export const VISION_MAX_BYTES = 2_097_152;
export const VISION_PHOTO_LIMIT = 40;
export const VISION_CAPTION_LIMIT = 140;
export const VISION_STATEMENT_LIMIT = 280;
/** Owner links. Vision photos are private and are not given a short community URL. */
export const VISION_SIGNED_URL_SECONDS = 3600;

export const VISION_AREAS = [
  { id: 'health', label: 'Health' },
  { id: 'family', label: 'Family' },
  { id: 'home', label: 'Home' },
  { id: 'career', label: 'Career' },
  { id: 'travel', label: 'Travel' },
  { id: 'mind', label: 'Mind' },
  { id: 'money', label: 'Money' },
  { id: 'other', label: 'Other' },
] as const;

export type VisionArea = (typeof VISION_AREAS)[number]['id'];
export type VisionSize = 'small' | 'medium' | 'large';

export const VISION_SIZES: readonly VisionSize[] = ['small', 'medium', 'large'];

/** Greyed lines for an empty board. They are examples, not the person's photos. */
export const VISION_EMPTY_EXAMPLES = [
  { caption: 'A kitchen with morning light', area: 'Home' },
  { caption: 'Work I am glad to start', area: 'Career' },
  { caption: 'A long walk with people I love', area: 'Family' },
] as const;

export const VISION_EMPTY_STATEMENT = 'A quiet life I recognise as mine.';
export const VISION_DATE_WAITING = 'The date is five years from the day you begin.';

export const VISION_PROMPT_LINE =
  'If CONTEXT includes a vision board, you may use their statement and photo captions to encourage the life they described. Never invent a caption or a picture. The photos are private and were not sent. Do not pretend you can see them.';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type VisionItem = {
  id: string;
  caption: string;
  area: VisionArea | null;
  size: VisionSize;
  position: number;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
  /** Owner signed link, or a demo data URL. Never sent to Thumos. */
  previewUrl: string | null;
};

export type VisionCaption = { caption: string; area: string | null };

export type VisionContext = {
  statement: string;
  targetLabel: string | null;
  captions: VisionCaption[];
};

export function isVisionArea(value: unknown): value is VisionArea {
  return VISION_AREAS.some((area) => area.id === value);
}

export function visionAreaLabel(value: unknown): string | null {
  const area = VISION_AREAS.find((item) => item.id === value);
  return area ? area.label : null;
}

export function isVisionSize(value: unknown): value is VisionSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function visionStoragePath(userId: string, photoId: string): string {
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id.test(userId) || !id.test(photoId)) throw new Error('Could not store that photo.');
  return `${userId}/${photoId}.jpg`;
}

export function visionPhotoLimitMessage(count: number): string | null {
  if (count >= VISION_PHOTO_LIMIT) return 'Forty photos is enough for one board.';
  return null;
}

/** Empty becomes an empty string. Longer text is refused, not cut, so a save cannot drop the ending. */
export function planVisionText(value: string, limit: number): { ok: true; text: string } | { ok: false; message: string } {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > limit) return { ok: false, message: `Keep that to ${limit} characters.` };
  return { ok: true, text };
}

/** Five years after the day the board was begun. The day is stored, not edited. */
export function visionTargetDay(startedOn: string): string {
  const [year, month, day] = startedOn.split('-').map(Number);
  const target = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  target.setFullYear(target.getFullYear() + 5);
  const nextMonth = String(target.getMonth() + 1).padStart(2, '0');
  const nextDay = String(target.getDate()).padStart(2, '0');
  return `${target.getFullYear()}-${nextMonth}-${nextDay}`;
}

/** 11 October 2031. Fixed English month names, so the label does not depend on the device locale. */
export function formatVisionTarget(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const name = MONTHS[(month ?? 1) - 1] ?? '';
  return `${day ?? 1} ${name} ${year ?? ''}`.trim();
}

export function visionDateLine(startedOn: string | null): string {
  if (!startedOn || !/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) return VISION_DATE_WAITING;
  return `Looking towards ${formatVisionTarget(visionTargetDay(startedOn))}.`;
}

export function sortVisionItems<T extends { position: number; createdAt: string; id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Large tiles take a row of their own. Smaller tiles sit two to a row, in order. */
export function packVisionRows<T extends { size: VisionSize }>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  const flush = () => {
    if (row.length) rows.push(row);
    row = [];
  };
  for (const item of items) {
    if (item.size === 'large') {
      flush();
      rows.push([item]);
      continue;
    }
    row.push(item);
    if (row.length === 2) flush();
  }
  flush();
  return rows;
}

export function moveVisionItem<T extends { id: string }>(items: readonly T[], id: string, direction: 'up' | 'down'): T[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return [...items];
  const next = direction === 'up' ? index - 1 : index + 1;
  if (next < 0 || next >= items.length) return [...items];
  const copy = [...items];
  const removed = copy.splice(index, 1)[0];
  if (!removed) return [...items];
  copy.splice(next, 0, removed);
  return copy;
}

export function visionItemsFromRows(rows: unknown): VisionItem[] {
  if (!Array.isArray(rows)) return [];
  const items: VisionItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = record.id == null ? '' : String(record.id);
    const storagePath = typeof record.storage_path === 'string' ? record.storage_path : '';
    if (!id || !storagePath || storagePath.includes('..')) continue;
    items.push({
      id,
      caption: typeof record.caption === 'string' ? record.caption : '',
      area: isVisionArea(record.area) ? record.area : null,
      size: isVisionSize(record.size) ? record.size : 'medium',
      position: Number.isFinite(Number(record.position)) ? Number(record.position) : 0,
      storagePath,
      createdAt: String(record.created_at ?? ''),
      updatedAt: String(record.updated_at ?? record.created_at ?? ''),
      previewUrl: null,
    });
  }
  return sortVisionItems(items);
}

/** Text only. Paths, links, and pixels are left out on purpose. */
export function visionContextFrom(
  statement: string | null,
  startedOn: string | null,
  items: readonly { caption: string; area: string | null }[],
): VisionContext {
  const planned = planVisionText(statement ?? '', VISION_STATEMENT_LIMIT);
  const captions: VisionCaption[] = [];
  for (const item of items) {
    const caption = planVisionText(item.caption, VISION_CAPTION_LIMIT);
    if (!caption.ok || !caption.text) continue;
    captions.push({ caption: caption.text, area: visionAreaLabel(item.area) });
    if (captions.length >= 12) break;
  }
  return {
    statement: planned.ok ? planned.text : '',
    targetLabel: startedOn && /^\d{4}-\d{2}-\d{2}$/.test(startedOn) ? formatVisionTarget(visionTargetDay(startedOn)) : null,
    captions,
  };
}

export function formatVisionContext(vision: VisionContext | null | undefined): string {
  if (!vision) return '';
  const lines: string[] = [];
  if (vision.statement) lines.push(`Statement: ${vision.statement}`);
  if (vision.targetLabel) lines.push(`Looking towards ${vision.targetLabel}.`);
  if (vision.captions.length) {
    lines.push('Photo captions, words only:');
    for (const item of vision.captions) {
      lines.push(item.area ? `- ${item.area}: ${item.caption}` : `- ${item.caption}`);
    }
  }
  if (!lines.length) return '';
  return ['Vision board, their words only. The photos were not sent.', ...lines].join('\n');
}
