/** Avoirdupois. One stone is 14 pounds. Weight is stored in kilograms. */
export const KG_PER_POUND = 0.45359237;
export const POUNDS_PER_STONE = 14;
export const WEIGHT_KG_MAX = 500;

export type WeightUnitMode = 'kg' | 'stlb';

export type WeightParse = { ok: true; kg: number | null } | { ok: false; error: string };

export type WeightReadingDraft = {
  kg: number;
  recordedOn: string;
  heightText: string;
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
