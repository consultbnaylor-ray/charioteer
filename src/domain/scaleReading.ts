import { NICE_BMI_URL, NHS_BMI_URL, bmiFrom } from '@/domain/guidance';

/** Copy for the weight, BMI, body fat, and lean mass note. */

export const SCALE_CORE_LINE =
  'BMI cannot tell muscle from fat. Read it next to body fat and lean mass.';

export const SCALE_COMPARE_LINE =
  'Compare readings at the same time of day. A home scale estimate can change from one reading to the next.';

export const SCALE_EMPTY_LINE = 'No weight, body fat, or lean mass yet.';

export const SCALE_NO_READING = 'No reading';

export const SCALE_NEEDS_HEIGHT = 'Needs height';

export const SCALE_MORE_BAND =
  'A general-population weight or BMI band does not know how much of the weight is muscle. The World Health Organization uses BMI as a population guide. Its fact sheet says BMI may not correspond to the same degree of fatness in different people.';

export const SCALE_MORE_ARRIVES =
  'Apple Health can share weight, height, body fat percentage, and lean body mass. It has no standard type for skeletal muscle, a separate muscle-mass figure, protein, a scale BMR, subcutaneous fat, visceral fat, body water, bone mass, metabolic age, or a body-type name. Fat-free weight arrives only when the scale writes it as lean body mass.';

export const SCALE_MORE_BMI =
  'BMI here is weight in kilograms divided by height in metres squared, the same sum as the NHS BMI calculator. NICE NG246 describes 18.5 to 24.9 as a healthy weight for most adults. That band is already on the weight range. It is a reference, not a target, and not a diagnosis.';

export const WHO_OBESITY_URL = 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight';

export const SCALE_SOURCES = [
  { name: 'World Health Organization: obesity and overweight', url: WHO_OBESITY_URL },
  { name: 'NHS BMI calculator', url: NHS_BMI_URL },
  { name: 'NICE NG246', url: NICE_BMI_URL },
] as const;

export type ScaleFigure = { label: string; value: string };

export type ScaleReadingInput = {
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
};

function shownNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Weight, calculated BMI, body fat, and lean mass. No category name is applied. */
export function scaleReadingFigures(input: ScaleReadingInput): { empty: boolean; figures: ScaleFigure[] } {
  const empty = input.weightKg == null && input.bodyFatPct == null && input.leanMassKg == null;
  if (empty) return { empty: true, figures: [] };
  const bmi = input.weightKg != null && input.heightCm != null ? bmiFrom(input.weightKg, input.heightCm) : null;
  return {
    empty: false,
    figures: [
      { label: 'Weight', value: input.weightKg == null ? SCALE_NO_READING : `${shownNumber(input.weightKg)} kg` },
      { label: 'BMI', value: bmi == null ? SCALE_NEEDS_HEIGHT : bmi.toFixed(1) },
      { label: 'Body fat', value: input.bodyFatPct == null ? SCALE_NO_READING : `${shownNumber(input.bodyFatPct)}%` },
      { label: 'Lean mass', value: input.leanMassKg == null ? SCALE_NO_READING : `${shownNumber(input.leanMassKg)} kg` },
    ],
  };
}
