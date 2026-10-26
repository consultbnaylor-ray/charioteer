/**
 * A line kept from a finished outing.
 * It stays on this phone. It is not sent, not an account row, and not part of the summary.
 * Stop does not write it. Only Save this route does. Delete removes the record.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { activityWord, type ActivityKind } from '@/domain/activitySession';
import { ROUTE_POINT_CAP, metresBetween, routeTitleOf, simplifyLine } from '@/domain/outdoorRoute';

export const WALKED_LINES_KEY = 'charioteer.walked-lines';

/** Metres left off each end of the saved copy, measured along the line. */
export const WALKED_TRIM_M = 200;

export const DROP_ENDS = 'Drop the first and last 200 m';
export const KEEP_WHOLE_LINE = 'Keep the whole line';
export const FEWER_POINTS = 'Use fewer points';
export const LINE_TOO_SHORT = 'The line is too short to drop the ends.';
export const SAVE_ON_PHONE = 'Save keeps the line on this phone. It is not sent. Done without Save drops the line.';
export const ON_THIS_PHONE = 'On this phone';
export const PHONE_LINE_DELETE = 'This removes the saved line from this phone.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type WalkedPoint = { latitude: number; longitude: number };

export type WalkedLine = {
  id: string;
  name: string;
  activity: ActivityKind;
  date: string;
  points: WalkedPoint[];
};

export function copyWalkedPoints(points: readonly WalkedPoint[]): WalkedPoint[] {
  return points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
}

function finitePoint(point: WalkedPoint | null | undefined): WalkedPoint | null {
  if (!point) return null;
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return null;
  return { latitude: point.latitude, longitude: point.longitude };
}

function clean(points: readonly WalkedPoint[]): WalkedPoint[] {
  return points.map((point) => finitePoint(point)).filter((point): point is WalkedPoint => point != null);
}

function pointAt(a: WalkedPoint, b: WalkedPoint, fromM: number, toM: number, atM: number): WalkedPoint {
  const span = toM - fromM;
  const t = span <= 0 ? 0 : (atM - fromM) / span;
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/**
 * Leaves out the first and last `metres` along the line.
 * A line that would not keep two points is returned unchanged.
 */
export function trimEnds(
  points: readonly WalkedPoint[],
  metres = WALKED_TRIM_M,
): { points: WalkedPoint[]; trimmed: boolean } {
  const line = clean(points);
  if (line.length < 2 || !(metres > 0)) return { points: line, trimmed: false };
  const cum = [0];
  for (let index = 1; index < line.length; index += 1) {
    cum.push(cum[index - 1] + metresBetween(line[index - 1], line[index]));
  }
  const total = cum[cum.length - 1];
  if (!(total > metres * 2)) return { points: line, trimmed: false };
  const startAt = metres;
  const endAt = total - metres;
  let startIndex = 1;
  while (startIndex < cum.length && cum[startIndex] < startAt) startIndex += 1;
  let endIndex = 1;
  while (endIndex < cum.length && cum[endIndex] < endAt) endIndex += 1;
  if (startIndex >= line.length || endIndex >= line.length) return { points: line, trimmed: false };
  const start = pointAt(line[startIndex - 1], line[startIndex], cum[startIndex - 1], cum[startIndex], startAt);
  const end = pointAt(line[endIndex - 1], line[endIndex], cum[endIndex - 1], cum[endIndex], endAt);
  const kept: WalkedPoint[] = [start];
  for (let index = startIndex; index < endIndex; index += 1) {
    if (cum[index] > startAt && cum[index] < endAt) kept.push(line[index]);
  }
  const last = kept[kept.length - 1];
  if (!last || last.latitude !== end.latitude || last.longitude !== end.longitude) kept.push(end);
  if (kept.length < 2 || metresBetween(kept[0], kept[kept.length - 1]) < 1) return { points: line, trimmed: false };
  return { points: kept, trimmed: true };
}

/** Even sample up to the route cap. The first and last point stay. This is not the trim. */
export function fewerPoints(points: readonly WalkedPoint[], cap = ROUTE_POINT_CAP): WalkedPoint[] {
  const line = clean(points);
  if (line.length <= cap) return simplifyLine(line, cap);
  const lastIndex = line.length - 1;
  const picked: WalkedPoint[] = [];
  for (let step = 0; step < cap; step += 1) {
    const point = line[Math.round((step * lastIndex) / (cap - 1))];
    const prev = picked[picked.length - 1];
    if (!point || (prev && prev.latitude === point.latitude && prev.longitude === point.longitude)) continue;
    picked.push(point);
  }
  const end = line[lastIndex];
  if (end && (picked.length === 0 || picked[picked.length - 1].latitude !== end.latitude || picked[picked.length - 1].longitude !== end.longitude)) {
    if (picked.length >= cap) picked[picked.length - 1] = end;
    else picked.push(end);
  }
  return picked;
}

export function prepareWalkedLine(
  points: readonly WalkedPoint[],
  choices: { trim: boolean; fewer: boolean },
): { points: WalkedPoint[]; trimmed: boolean } {
  const trimmed = choices.trim ? trimEnds(points) : { points: clean(points), trimmed: false };
  return {
    points: choices.fewer ? fewerPoints(trimmed.points) : trimmed.points,
    trimmed: trimmed.trimmed,
  };
}

/** "Walk on 26 Oct". An unreadable date opens on the existing "My route". */
export function suggestWalkedName(activity: ActivityKind, dateIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return 'My route';
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || !(day >= 1 && day <= 31)) return 'My route';
  return `${activityWord(activity)} on ${day} ${month}`;
}

function parseLine(value: unknown): WalkedLine | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  const name = typeof row.name === 'string' ? routeTitleOf(row.name) : null;
  if (!name) return null;
  if (row.activity !== 'walk' && row.activity !== 'run' && row.activity !== 'cycle') return null;
  if (typeof row.date !== 'string' || !row.date) return null;
  if (!Array.isArray(row.points)) return null;
  const points = clean(row.points as WalkedPoint[]);
  if (points.length < 2) return null;
  return { id: row.id, name, activity: row.activity, date: row.date, points };
}

export async function loadWalkedLines(): Promise<WalkedLine[]> {
  try {
    const raw = await AsyncStorage.getItem(WALKED_LINES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseLine).filter((row): row is WalkedLine => row != null);
  } catch {
    return [];
  }
}

export async function saveWalkedLine(line: WalkedLine): Promise<void> {
  const stored = parseLine(line);
  if (!stored) return;
  const current = await loadWalkedLines();
  const next = [stored, ...current.filter((row) => row.id !== stored.id)];
  await AsyncStorage.setItem(WALKED_LINES_KEY, JSON.stringify(next));
}

/** Removes the record. An empty list deletes the key, so no points remain under it. */
export async function deleteWalkedLine(id: string): Promise<void> {
  const current = await loadWalkedLines();
  const next = current.filter((row) => row.id !== id);
  if (next.length === 0) {
    await AsyncStorage.removeItem(WALKED_LINES_KEY);
    return;
  }
  await AsyncStorage.setItem(WALKED_LINES_KEY, JSON.stringify(next));
}
