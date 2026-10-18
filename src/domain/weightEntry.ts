import { formatHealthValue, formatUkCompactDay, shiftDay } from '@/domain/healthInsights';
import { parseWaistCm, weightPointsFrom } from '@/domain/nutrition';

/** Avoirdupois. One stone is 14 pounds. Weight is stored in kilograms. */
export const KG_PER_POUND = 0.45359237;
export const POUNDS_PER_STONE = 14;
export const WEIGHT_KG_MAX = 500;

export type WeightUnitMode = 'kg' | 'stlb';
export type WaistUnitMode = 'cm' | 'in';

export type WeightParse = { ok: true; kg: number | null } | { ok: false; error: string };
export type WaistParse = { ok: true; cm: number | null } | { ok: false; error: string };

export type WeightReadingDraft = {
  kg: number | null;
  recordedOn: string;
  heightText: string;
  waistCm: number | null;
};

/** Tape measure at the navel, after a relaxed breath out. */
export const WAIST_MEASURE_NOTE = 'Measure at the navel, relaxed breath out.';

/** Body-figure share is the only switch that can show a waist line to other people. */
export const WAIST_PRIVATE_NOTE = 'Waist stays private unless Share weight and body figures is on.';

export type WaistDay = { day: string; cm: number };

export type WaistWindow = {
  points: WaistDay[];
  latest: WaistDay | null;
  averageCm: number | null;
};

export function roundWeightKg(kg: number): number {
  return Math.round(kg * 10) / 10;
}

export function stonesAndPoundsToKg(stones: number, pounds: number): number {
  return roundWeightKg((stones * POUNDS_PER_STONE + pounds) * KG_PER_POUND);
}

function blank(value: string): boolean {
  return value.trim() === '';
}

function parseKilograms(text: string): WeightParse {
  if (blank(text)) return { ok: true, kg: null };
  const parsed = Number(text.trim());
  if (!Number.isFinite(parsed)) return { ok: false, error: 'Enter your weight in kilograms, such as 74.2.' };
  if (parsed <= 0) return { ok: false, error: 'Enter a weight above zero.' };
  const kg = roundWeightKg(parsed);
  if (kg <= 0) return { ok: false, error: 'Enter a weight above zero.' };
  if (kg > WEIGHT_KG_MAX) return { ok: false, error: 'Enter a weight up to 500 kg.' };
  return { ok: true, kg };
}

function parseStonesAndPounds(stones: string, pounds: string): WeightParse {
  if (blank(stones) && blank(pounds)) return { ok: true, kg: null };
  let stoneCount = 0;
  if (!blank(stones)) {
    const parsed = Number(stones.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      return { ok: false, error: 'Enter stones as a whole number, such as 11.' };
    }
    stoneCount = parsed;
  }
  let poundCount = 0;
  if (!blank(pounds)) {
    const parsed = Number(pounds.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed >= POUNDS_PER_STONE) {
      return { ok: false, error: 'Enter pounds under 14, such as 6.' };
    }
    poundCount = parsed;
  }
  if (stoneCount === 0 && poundCount === 0) return { ok: false, error: 'Enter a weight above zero.' };
  const kg = stonesAndPoundsToKg(stoneCount, poundCount);
  if (kg <= 0) return { ok: false, error: 'Enter a weight above zero.' };
  if (kg > WEIGHT_KG_MAX) return { ok: false, error: 'Enter a weight up to 500 kg.' };
  return { ok: true, kg };
}

/** Kilograms by default. Stones and pounds are the UK entry. An empty form is not a weight. */
export function weightReadingKg(input: {
  unit: WeightUnitMode;
  kilograms: string;
  stones: string;
  pounds: string;
}): WeightParse {
  return input.unit === 'kg'
    ? parseKilograms(input.kilograms)
    : parseStonesAndPounds(input.stones, input.pounds);
}

export function weightReadingReady(parsed: WeightParse): boolean {
  return parsed.ok && parsed.kg != null;
}

/** Centimetres by default. Inches are converted and stored as centimetres. An empty field is not a waist. */
export function waistReadingCm(text: string, unit: WaistUnitMode): WaistParse {
  if (blank(text)) return { ok: true, cm: null };
  const parsed = Number(text.trim());
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      error: unit === 'in' ? 'Enter your waist in inches, such as 33.' : 'Enter your waist in centimetres, such as 84.',
    };
  }
  const cm = parseWaistCm(parsed, unit);
  if (cm == null) {
    return {
      ok: false,
      error: unit === 'in' ? 'Waist sits between about 16 and 79 inches.' : 'Waist sits between 40 and 200 cm.',
    };
  }
  return { ok: true, cm };
}

export function formatWaistCm(cm: number): string {
  const rounded = Math.round(cm * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} cm`;
}

export type WeightSampleWrite = {
  kind: 'weight_kg';
  value: number;
  unit: 'kg';
  recordedOn: string;
  source: 'manual';
};

export type WaistSampleWrite = {
  recordedOn: string;
  bodyFatPct: null;
  leanMassKg: null;
  waistCm: number;
  source: 'other';
};

/**
 * The save the weight sheet and the You panel both use.
 * Weight becomes a manual weight_kg sample. Waist becomes body_composition.waist_cm.
 * Apple Health keeps writing its own weight samples; this does not start a second sync.
 */
export function weightWaistWrite(
  draft: Pick<WeightReadingDraft, 'kg' | 'recordedOn' | 'waistCm'>,
  today: string,
): { ok: true; sample: WeightSampleWrite | null; waist: WaistSampleWrite | null } | { ok: false; error: string } {
  if (draft.recordedOn > today) return { ok: false, error: 'Choose today or an earlier day.' };
  let sample: WeightSampleWrite | null = null;
  if (draft.kg != null) {
    const parsed = weightReadingKg({ unit: 'kg', kilograms: String(draft.kg), stones: '', pounds: '' });
    if (!parsed.ok || parsed.kg == null) {
      return { ok: false, error: parsed.ok ? 'Enter a weight above zero.' : parsed.error };
    }
    sample = {
      kind: 'weight_kg',
      value: parsed.kg,
      unit: 'kg',
      recordedOn: draft.recordedOn,
      source: 'manual',
    };
  }
  let waist: WaistSampleWrite | null = null;
  if (draft.waistCm != null) {
    const parsed = waistReadingCm(String(draft.waistCm), 'cm');
    if (!parsed.ok || parsed.cm == null) {
      return { ok: false, error: parsed.ok ? 'Enter a waist above zero.' : parsed.error };
    }
    waist = {
      recordedOn: draft.recordedOn,
      bodyFatPct: null,
      leanMassKg: null,
      waistCm: parsed.cm,
      source: 'other',
    };
  }
  return { ok: true, sample, waist };
}

/** Newest stored weight, including a sample Apple Health already synced. */
export function latestWeightPoint(
  samples: readonly { kind: string; value: number; recordedOn: string }[],
): { day: string; kg: number } | null {
  return weightPointsFrom(samples).at(-1) ?? null;
}

/** Newest stored waist, matching the body-composition row the weight sheet reads. */
export function latestWaistPoint(
  rows: readonly { recordedOn: string; waistCm: number | null; createdAt: string }[],
): { day: string; cm: number } | null {
  const ordered = [...rows].sort(
    (left, right) => right.recordedOn.localeCompare(left.recordedOn) || right.createdAt.localeCompare(left.createdAt),
  );
  const row = ordered.find((item) => item.waistCm != null && item.waistCm > 0);
  if (!row || row.waistCm == null) return null;
  return { day: row.recordedOn.slice(0, 10), cm: row.waistCm };
}

export function latestWeightLine(point: { day: string; kg: number } | null): string {
  if (!point) return 'No weight logged yet';
  return `Latest weight ${formatHealthValue('weight_kg', point.kg)} · ${formatUkCompactDay(point.day)}`;
}

export function latestWaistLine(point: { day: string; cm: number } | null): string {
  if (!point) return 'No waist logged yet';
  return `Latest waist ${formatWaistCm(point.cm)} · ${formatUkCompactDay(point.day)}`;
}

/**
 * One waist per day in the window, newest day first.
 * A later save on the same day replaces the earlier one. The average is the daily values.
 */
export function waistWindow(
  rows: readonly { recordedOn: string; waistCm: number | null; createdAt: string }[],
  today: string,
  windowDays: number,
): WaistWindow {
  const byDay = new Map<string, { cm: number; createdAt: string }>();
  for (const row of rows) {
    if (row.waistCm == null || !(row.waistCm > 0)) continue;
    const day = row.recordedOn.slice(0, 10);
    if (day > today) continue;
    const current = byDay.get(day);
    if (!current || row.createdAt > current.createdAt) byDay.set(day, { cm: row.waistCm, createdAt: row.createdAt });
  }
  const start = shiftDay(today, -(windowDays - 1));
  const points = [...byDay.entries()]
    .filter(([day]) => day >= start && day <= today)
    .map(([day, value]) => ({ day, cm: value.cm }))
    .sort((left, right) => (left.day < right.day ? 1 : left.day > right.day ? -1 : 0));
  const latest = points[0] ?? null;
  const averageCm = points.length === 0
    ? null
    : Math.round((points.reduce((sum, point) => sum + point.cm, 0) / points.length) * 10) / 10;
  return { points, latest, averageCm };
}
