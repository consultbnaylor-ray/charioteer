/**
 * Food log maths. Figures from a photo or a sentence are estimates.
 * The NHS pint used for alcohol calories is the same 222 kcal / about 3 units
 * already published in the units guide.
 * https://www.nhs.uk/live-well/alcohol-advice/calories-in-alcohol/
 */

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type MealSource = 'photo' | 'text' | 'manual';

export const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const ESTIMATE_LABEL = 'Estimate';
export const ESTIMATE_HINT = 'These are estimates. Change anything that looks wrong, then save.';
/**
 * HealthKit writes do not keep the sample id, so a later edit cannot replace
 * that sample. A second write would count the meal twice.
 */
export const APPLE_HEALTH_MEAL_NOTE =
  'If this meal was saved to Apple Health, the earlier sample stays. This app did not store a sample id, so it cannot update or delete that sample.';
export const PORTION_MIN = 0.25;
export const PORTION_MAX = 12;
export const HIDE_CALORIES_LINE = 'Calories are hidden. This view is about food quality.';
export const NO_SHAME_OVER = 'Above the target you set. There is no failing a day.';
export const WITHIN_TARGET = 'Within the target you set.';
export const FAT_SCIENCE =
  'Unsaturated fats, such as olive oil, nuts, oily fish and avocado, are the ones to lean on. Trans fats and a lot of saturated fat are not.';
export const SUGAR_CRAVING_NOTE =
  'Sugar cravings are common in the early weeks after stopping. Protein and fibre at meals can take the edge off. This is general wellbeing, not medical advice.';
export const EARLY_RECOVERY_DAYS = 90;
export const WAGON_PUBLIC_LINE = 'Having a hard moment. A private message is welcome.';
export const WAGON_SUPPORT = [
  'Samaritans, free, 24 hours: 116 123',
  'Drinkline: 0300 123 1110',
  'NHS 111 if you are worried about withdrawal',
] as const;
export const NUTRITION_PROMPT_LINE =
  'If CONTEXT includes a nutrition summary, you may mention it. Estimates are estimates. Do not shame anyone about calories, weight, or a day over a target. If calories are hidden, do not mention kcal. If CONTEXT includes a nutrition goal, offer one gentle tip that fits that goal. Do not suggest eating less when CONTEXT says a lower intake is not being suggested. If the goal is an elite runner, talk about carbohydrate around training and moderate protein, and lean body composition rather than the scales. If the goal is body building, talk about a surplus or a cut phase, protein, and body fat and lean mass, and do not push an aggressive deficit. If the goal is a heavyweight boxer, talk about size and power, high protein, and food around training. Do not suggest a deficit. If the goal is a middleweight boxer, talk about staying near a middleweight limit with a small change only. Never suggest a rapid weight cut, skipping meals to make weight, a sauna, or dehydration. For someone sober, recovery tips stay alcohol-free: food, water, sleep, and a soft drink if they want one. If CONTEXT includes body composition, use body fat before waist-to-height, and waist-to-height before BMI. Do not call someone overweight or obese from BMI when CONTEXT says they lift weights, or when CONTEXT is using body fat or waist. If CONTEXT says they have fallen off the wagon, treat that as a safety moment: be gentle, do not shame, and mention the Samaritans on 116 123 and Drinkline on 0300 123 1110. Sugar cravings in early recovery are common; you may say so only when CONTEXT includes that note.';

/** NHS: up to 222 kcal in a pint of 5.2% lager, about 3 units. */
export const NHS_PINT_52_KCAL = 222;
export const NHS_PINT_52_UNITS = 3;

export type FoodItem = {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  sugarG: number;
  fibreG: number;
  unsaturatedG: number;
  saturatedG: number;
  transG: number;
  sodiumMg: number;
  processed: boolean;
};

export type FoodLog = {
  id: string;
  userId: string;
  eatenOn: string;
  /** When they ate it. Null on older rows that only stored the day. */
  eatenAt: string | null;
  meal: MealSlot;
  source: MealSource;
  note: string;
  items: FoodItem[];
  estimated: boolean;
  /** 1 is the logged amount. A later portion scales the figures already stored. */
  portion: number;
  createdAt: string;
  previewUrl: string | null;
};

export type NutritionSettings = {
  kcalTarget: number | null;
  hideCalories: boolean;
  /** Today's meal names. Not the figures. */
  shareFoodDiary: boolean;
  /** kcal and macros. Separate from the fat bar. */
  shareCalories: boolean;
  /** Unsaturated fat against saturated and trans fat. */
  shareQuality: boolean;
  /** Consecutive days with a meal logged. */
  shareProgress: boolean;
  /** Null until they choose one. */
  goal: NutritionGoal | null;
  goalAge: number | null;
  goalSex: NutritionSex | null;
  proteinTarget: number | null;
  /** Grams a day. Null until they set one. */
  carbTarget: number | null;
  /** Grams a day. Null until they set one. */
  fatTarget: number | null;
  /** Body building only. Null until they choose a surplus or a cut. */
  goalPhase: BuilderPhase | null;
  /** Combat-sport weight class, kilograms. Null when they have not set one. */
  weightClassKg: number | null;
  /** Recent Apple Health active energy, kcal a day. Null when it has not been read. */
  activityEnergyKcal: number | null;
  /** Goal name and a qualitative progress line. Off until switched on. */
  shareGoal: boolean;
  wagonOn: boolean;
  wagonNote: string;
  wagonVisible: boolean;
  /** Null until they choose one. Muscular turns BMI category labels off. */
  build: BodyBuild | null;
  /** When this settings row was last written. Null until a row exists. */
  updatedAt: string | null;
};

export type NutritionDay = { day: string; waterMl: number };

export const BODY_BUILDS = ['muscular', 'average', 'slim'] as const;
export type BodyBuild = (typeof BODY_BUILDS)[number];

export const BUILD_LABEL: Record<BodyBuild, string> = {
  muscular: 'Muscular / I lift weights',
  average: 'Average',
  slim: 'Slim',
};

export const BODY_ENTRY_SOURCES = ['smart_scale', 'gym_scan', 'dexa', 'other'] as const;
export type BodyEntrySource = (typeof BODY_ENTRY_SOURCES)[number];
export type BodyCompositionSource = BodyEntrySource | 'healthkit';

export const BODY_SOURCE_LABEL: Record<BodyCompositionSource, string> = {
  healthkit: 'Apple Health',
  smart_scale: 'Smart scale',
  gym_scan: 'Gym scan',
  dexa: 'DEXA',
  other: 'Other',
};

/** Shown when weight status has nothing but BMI. */
export const BMI_ONLY_NOTE = "BMI can't tell muscle from fat; add body fat or waist for a better picture";

/** Waist divided by height. Below this is the healthy band used on this screen. */
export const WAIST_HEIGHT_HEALTHY = 0.5;

/**
 * Descriptive bands for this screen, not an NHS category.
 * Body fat is used instead of a BMI label when it is known.
 */
export const BODY_FAT_HIGH = { female: 32, male: 25, unset: 28 } as const;
export const BODY_FAT_LOW = { female: 14, male: 6, unset: 10 } as const;

export type BodyCompositionReading = {
  id: string;
  recordedOn: string;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  waistCm: number | null;
  source: BodyCompositionSource;
  createdAt: string;
};

export type WeightAssessment = {
  basis: 'body_fat' | 'waist' | 'bmi' | 'none';
  label: string | null;
  plain: string;
  /** Overweight and obese words stay off. */
  hideBmiCategory: boolean;
  /** The existing under-18.5 safety floor still applies. */
  underweight: boolean;
};

export function defaultNutritionSettings(): NutritionSettings {
  return {
    kcalTarget: null,
    hideCalories: false,
    shareFoodDiary: false,
    shareCalories: false,
    shareQuality: false,
    shareProgress: false,
    goal: null,
    goalAge: null,
    goalSex: null,
    proteinTarget: null,
    carbTarget: null,
    fatTarget: null,
    goalPhase: null,
    weightClassKg: null,
    activityEnergyKcal: null,
    shareGoal: false,
    wagonOn: false,
    wagonNote: '',
    wagonVisible: false,
    build: null,
    updatedAt: null,
  };
}

export function isMealSlot(value: string): value is MealSlot {
  return (MEAL_SLOTS as readonly string[]).includes(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function num(value: unknown, places: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  const factor = 10 ** places;
  return Math.round(parsed * factor) / factor;
}

export function foodItemFromUnknown(value: unknown): FoodItem | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name.trim().slice(0, 80) : '';
  if (!name) return null;
  return {
    name,
    kcal: num(row.kcal, 0),
    proteinG: num(row.proteinG ?? row.protein_g, 1),
    carbsG: num(row.carbsG ?? row.carbs_g, 1),
    sugarG: num(row.sugarG ?? row.sugar_g, 1),
    fibreG: num(row.fibreG ?? row.fibre_g, 1),
    unsaturatedG: num(row.unsaturatedG ?? row.unsaturated_g, 1),
    saturatedG: num(row.saturatedG ?? row.saturated_g, 1),
    transG: num(row.transG ?? row.trans_g, 1),
    sodiumMg: num(row.sodiumMg ?? row.sodium_mg, 0),
    processed: row.processed === true,
  };
}

export function parseMealEstimate(payload: unknown): FoodItem[] | null {
  const raw = typeof payload === 'string' ? jsonFromText(payload) : payload;
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const parsed = items.map(foodItemFromUnknown).filter((item): item is FoodItem => item != null);
  return parsed.length ? parsed.slice(0, 12) : null;
}

function jsonFromText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export const MEAL_ESTIMATE_PROMPT = [
  'You estimate a meal for a UK food log. Reply with JSON only, no markdown.',
  'Shape: {"items":[{"name":"","kcal":0,"proteinG":0,"carbsG":0,"sugarG":0,"fibreG":0,"unsaturatedG":0,"saturatedG":0,"transG":0,"sodiumMg":0,"processed":false}]}',
  'Use grams except kcal and sodium (milligrams). unsaturatedG is mono and poly together.',
  'processed is true for ultra-processed foods such as crisps, biscuits, sweets, fizzy drinks, and reconstituted meat.',
  'These are estimates. Do not invent a medical claim. If the picture or text is not food, return {"items":[]}.',
].join(' ');

type KnownFood = { keys: string[]; name: string; each: Omit<FoodItem, 'name'>; processed: boolean };

const KNOWN: readonly KnownFood[] = [
  { keys: ['egg', 'eggs'], name: 'Egg', processed: false, each: { kcal: 78, proteinG: 6.4, carbsG: 0, sugarG: 0, fibreG: 0, unsaturatedG: 3.2, saturatedG: 1.6, transG: 0, sodiumMg: 70, processed: false } },
  { keys: ['toast', 'bread'], name: 'Slice of toast', processed: false, each: { kcal: 80, proteinG: 3, carbsG: 15, sugarG: 1, fibreG: 1.2, unsaturatedG: 0.4, saturatedG: 0.2, transG: 0, sodiumMg: 140, processed: false } },
  { keys: ['porridge', 'oats'], name: 'Porridge', processed: false, each: { kcal: 180, proteinG: 6, carbsG: 28, sugarG: 1, fibreG: 3, unsaturatedG: 2, saturatedG: 0.6, transG: 0, sodiumMg: 40, processed: false } },
  { keys: ['banana'], name: 'Banana', processed: false, each: { kcal: 95, proteinG: 1.2, carbsG: 23, sugarG: 12, fibreG: 2.6, unsaturatedG: 0.1, saturatedG: 0.1, transG: 0, sodiumMg: 1, processed: false } },
  { keys: ['apple'], name: 'Apple', processed: false, each: { kcal: 52, proteinG: 0.3, carbsG: 14, sugarG: 10, fibreG: 2.4, unsaturatedG: 0, saturatedG: 0, transG: 0, sodiumMg: 1, processed: false } },
  { keys: ['chicken'], name: 'Chicken', processed: false, each: { kcal: 165, proteinG: 31, carbsG: 0, sugarG: 0, fibreG: 0, unsaturatedG: 2, saturatedG: 1, transG: 0, sodiumMg: 70, processed: false } },
  { keys: ['salmon', 'oily fish', 'mackerel'], name: 'Oily fish', processed: false, each: { kcal: 200, proteinG: 20, carbsG: 0, sugarG: 0, fibreG: 0, unsaturatedG: 8, saturatedG: 2, transG: 0, sodiumMg: 60, processed: false } },
  { keys: ['avocado'], name: 'Avocado', processed: false, each: { kcal: 160, proteinG: 2, carbsG: 9, sugarG: 0.7, fibreG: 7, unsaturatedG: 10, saturatedG: 2, transG: 0, sodiumMg: 7, processed: false } },
  { keys: ['nuts', 'almonds'], name: 'Handful of nuts', processed: false, each: { kcal: 170, proteinG: 6, carbsG: 6, sugarG: 1, fibreG: 3, unsaturatedG: 12, saturatedG: 1.5, transG: 0, sodiumMg: 1, processed: false } },
  { keys: ['olive oil'], name: 'Olive oil', processed: false, each: { kcal: 120, proteinG: 0, carbsG: 0, sugarG: 0, fibreG: 0, unsaturatedG: 11, saturatedG: 2, transG: 0, sodiumMg: 0, processed: false } },
  { keys: ['crisps'], name: 'Crisps', processed: true, each: { kcal: 180, proteinG: 2, carbsG: 16, sugarG: 0.5, fibreG: 1, unsaturatedG: 6, saturatedG: 2, transG: 0.1, sodiumMg: 240, processed: true } },
  { keys: ['biscuit', 'biscuits'], name: 'Biscuits', processed: true, each: { kcal: 150, proteinG: 2, carbsG: 20, sugarG: 8, fibreG: 0.5, unsaturatedG: 2, saturatedG: 3, transG: 0.1, sodiumMg: 90, processed: true } },
  { keys: ['chocolate'], name: 'Chocolate', processed: true, each: { kcal: 210, proteinG: 2, carbsG: 24, sugarG: 22, fibreG: 1, unsaturatedG: 4, saturatedG: 7, transG: 0.1, sodiumMg: 30, processed: true } },
];

function scaled(food: KnownFood, count: number): FoodItem {
  const n = Math.min(12, Math.max(1, count));
  const each = food.each;
  return {
    name: n === 1 ? food.name : `${n} × ${food.name}`,
    kcal: Math.round(each.kcal * n),
    proteinG: round1(each.proteinG * n),
    carbsG: round1(each.carbsG * n),
    sugarG: round1(each.sugarG * n),
    fibreG: round1(each.fibreG * n),
    unsaturatedG: round1(each.unsaturatedG * n),
    saturatedG: round1(each.saturatedG * n),
    transG: round1(each.transG * n),
    sodiumMg: Math.round(each.sodiumMg * n),
    processed: food.processed,
  };
}

/** A local reading of a sentence such as "2 eggs on toast", used when the model is off. */
export function estimateFromText(text: string): FoodItem[] {
  const source = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const found: FoodItem[] = [];
  for (const food of KNOWN) {
    for (const key of food.keys) {
      const at = source.indexOf(key);
      if (at < 0) continue;
      const before = source.slice(Math.max(0, at - 4), at);
      const count = Number(before.match(/(\d+)\s*$/)?.[1] ?? '1');
      found.push(scaled(food, count));
      break;
    }
  }
  if (found.length) return found;
  const name = text.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (name.length < 2) return [];
  return [{
    name,
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    sugarG: 0,
    fibreG: 0,
    unsaturatedG: 0,
    saturatedG: 0,
    transG: 0,
    sodiumMg: 0,
    processed: false,
  }];
}

/** Demo photo reading. The live function sends the picture to the vision model. */
export function samplePhotoMeal(): FoodItem[] {
  return estimateFromText('chicken and avocado');
}

export function parsePortion(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim().replace(',', '.')) : NaN;
  if (!Number.isFinite(parsed) || parsed < PORTION_MIN || parsed > PORTION_MAX) return null;
  return Math.round(parsed * 100) / 100;
}

/** Scales every figure. The name and the processed flag stay as they are. */
export function scaleFoodItems(items: readonly FoodItem[], factor: number): FoodItem[] {
  const n = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return items.map((item) => ({
    ...item,
    kcal: Math.round(item.kcal * n),
    proteinG: round1(item.proteinG * n),
    carbsG: round1(item.carbsG * n),
    sugarG: round1(item.sugarG * n),
    fibreG: round1(item.fibreG * n),
    unsaturatedG: round1(item.unsaturatedG * n),
    saturatedG: round1(item.saturatedG * n),
    transG: round1(item.transG * n),
    sodiumMg: Math.round(item.sodiumMg * n),
  }));
}

export function sumItems(items: readonly FoodItem[]) {
  const totals = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    sugarG: 0,
    fibreG: 0,
    unsaturatedG: 0,
    saturatedG: 0,
    transG: 0,
    sodiumMg: 0,
    processed: 0,
    count: items.length,
  };
  for (const item of items) {
    totals.kcal += item.kcal;
    totals.proteinG += item.proteinG;
    totals.carbsG += item.carbsG;
    totals.sugarG += item.sugarG;
    totals.fibreG += item.fibreG;
    totals.unsaturatedG += item.unsaturatedG;
    totals.saturatedG += item.saturatedG;
    totals.transG += item.transG;
    totals.sodiumMg += item.sodiumMg;
    if (item.processed) totals.processed += 1;
  }
  totals.proteinG = round1(totals.proteinG);
  totals.carbsG = round1(totals.carbsG);
  totals.sugarG = round1(totals.sugarG);
  totals.fibreG = round1(totals.fibreG);
  totals.unsaturatedG = round1(totals.unsaturatedG);
  totals.saturatedG = round1(totals.saturatedG);
  totals.transG = round1(totals.transG);
  return totals;
}

export function dayItems(logs: readonly FoodLog[], day: string): FoodItem[] {
  return logs.filter((log) => log.eatenOn === day).flatMap((log) => log.items);
}

export function fatBalance(items: readonly FoodItem[]): { unsaturated: number; other: number; line: string } {
  const totals = sumItems(items);
  const other = round1(totals.saturatedG + totals.transG);
  const unsaturated = totals.unsaturatedG;
  if (unsaturated + other <= 0) return { unsaturated: 0, other: 0, line: 'No fat logged yet.' };
  if (unsaturated >= other) return { unsaturated, other, line: 'More unsaturated fat than saturated and trans.' };
  return { unsaturated, other, line: 'More saturated and trans fat than unsaturated.' };
}

export function processedLine(items: readonly FoodItem[]): string | null {
  if (!items.length) return null;
  const processed = items.filter((item) => item.processed).length;
  if (processed === 0) return 'Nothing logged today looks highly processed.';
  if (processed === 1) return '1 item looks highly processed. Whole foods still count.';
  return `${processed} items look highly processed. Whole foods still count.`;
}

export function targetLine(kcal: number, target: number | null, hideCalories: boolean): string | null {
  if (hideCalories || target == null) return null;
  if (kcal > target) return NO_SHAME_OVER;
  return WITHIN_TARGET;
}

export function alcoholKcalSaved(unitsAvoided: number): number {
  if (!Number.isFinite(unitsAvoided) || unitsAvoided <= 0) return 0;
  return Math.round(unitsAvoided * (NHS_PINT_52_KCAL / NHS_PINT_52_UNITS));
}

export function alcoholSavedLine(unitsAvoided: number, hideCalories: boolean): string | null {
  if (hideCalories) return null;
  const kcal = alcoholKcalSaved(unitsAvoided);
  if (kcal <= 0) return null;
  return `About ${kcal.toLocaleString('en-GB')} kcal not drunk, from the units you have avoided. Based on the NHS pint of 5.2% lager: 222 kcal for about 3 units.`;
}

export function sugarCravingNote(soberDays: number | null): string | null {
  if (soberDays == null || soberDays < 0 || soberDays > EARLY_RECOVERY_DAYS) return null;
  return SUGAR_CRAVING_NOTE;
}

/** Meal names only. Calories and macros are a separate share. */
export function publicMealLines(logs: readonly FoodLog[], day: string): { meal: string; detail: string }[] {
  return logs
    .filter((log) => log.eatenOn === day)
    .map((log) => {
      const names = log.items.map((item) => item.name).filter(Boolean).join(', ');
      const estimate = log.estimated ? ` · ${ESTIMATE_LABEL}` : '';
      return { meal: MEAL_LABEL[log.meal], detail: `${names || log.note || 'Meal'}${estimate}` };
    });
}

/** kcal plus protein, carbohydrate, sugar and fibre. The fat split stays on the quality share. */
export function caloriesShareLine(items: readonly FoodItem[], hideCalories: boolean): string {
  if (!items.length) return hideCalories ? 'No macros logged today.' : 'No calories or macros logged today.';
  const totals = sumItems(items);
  const parts = [
    hideCalories ? null : `${totals.kcal.toLocaleString('en-GB')} kcal`,
    `protein ${totals.proteinG} g`,
    `carbohydrate ${totals.carbsG} g`,
    `sugar ${totals.sugarG} g`,
    `fibre ${totals.fibreG} g`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' · ');
}

function shiftIsoDay(iso: string, delta: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Consecutive days with any meal, ending today, or yesterday if today is still empty. */
export function mealStreakDays(logs: readonly FoodLog[], today: string): number {
  const days = new Set(logs.map((log) => log.eatenOn));
  let cursor = today;
  if (!days.has(cursor)) {
    cursor = shiftIsoDay(cursor, -1);
    if (!days.has(cursor)) return 0;
  }
  let count = 0;
  while (days.has(cursor) && count < 366) {
    count += 1;
    cursor = shiftIsoDay(cursor, -1);
  }
  return count;
}

export function progressShareLine(days: number): string {
  if (days <= 0) return 'No meal streak yet.';
  if (days === 1) return '1 day with a meal logged.';
  return `${days} days in a row with a meal logged.`;
}

type CheckDay = { day: string; mood: number | null; sleepHours: number | null; snacks: number };

function dayKeyFromStamp(stamp: string): string {
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return stamp.slice(0, 10);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Snack counts against sleep and mood. No kcal, so it stays when calories are hidden. */
export function nutritionPatternLines(
  logs: readonly FoodLog[],
  checkIns: readonly { createdAt: string; mood: number; sleepHours: number }[],
): string[] {
  const days = new Map<string, CheckDay>();
  for (const log of logs) {
    const row = days.get(log.eatenOn) ?? { day: log.eatenOn, mood: null, sleepHours: null, snacks: 0 };
    if (log.meal === 'snack') row.snacks += 1;
    days.set(log.eatenOn, row);
  }
  for (const check of checkIns) {
    const day = dayKeyFromStamp(check.createdAt);
    const row = days.get(day) ?? { day, mood: null, sleepHours: null, snacks: 0 };
    row.mood = check.mood;
    row.sleepHours = check.sleepHours;
    days.set(day, row);
  }
  const rows = [...days.values()];
  const lines: string[] = [];
  const shortSleep = rows.filter((row) => row.sleepHours != null && row.sleepHours < 6);
  const longerSleep = rows.filter((row) => row.sleepHours != null && row.sleepHours >= 6);
  if (shortSleep.length && longerSleep.length) {
    const shortAvg = shortSleep.reduce((sum, row) => sum + row.snacks, 0) / shortSleep.length;
    const longAvg = longerSleep.reduce((sum, row) => sum + row.snacks, 0) / longerSleep.length;
    if (shortAvg > longAvg) lines.push('On days you slept under 6 hours, you logged more snacks.');
  }
  const lowMood = rows.filter((row) => row.mood != null && row.mood <= 4);
  const steadier = rows.filter((row) => row.mood != null && row.mood > 4);
  if (lowMood.length && steadier.length) {
    const lowAvg = lowMood.reduce((sum, row) => sum + row.snacks, 0) / lowMood.length;
    const highAvg = steadier.reduce((sum, row) => sum + row.snacks, 0) / steadier.length;
    if (lowAvg > highAvg) lines.push('Lower-mood days had more snacks.');
  }
  return lines;
}

export const WATER_DAY_ML = 2000;
export const WEEK_CHART_EMPTY = 'Log a few meals to see your week';

export type TodayRing = {
  kind: 'kcal' | 'protein';
  value: number;
  target: number | null;
  /** Share of the ring to fill, from 0 to 1. */
  fill: number;
  centre: string;
  unit: string;
  caption: string;
  /** Short line under the ring, such as "320 kcal left". */
  status: string;
};

/** Kcal against the target, or protein when calories are hidden. */
export function todayRing(input: {
  hideCalories: boolean;
  kcal: number;
  kcalTarget: number | null;
  proteinG: number;
  proteinTarget: number | null;
  logged: boolean;
}): TodayRing {
  const kind = input.hideCalories ? 'protein' : 'kcal';
  const value = kind === 'protein' ? input.proteinG : input.kcal;
  const target = kind === 'protein' ? input.proteinTarget : input.kcalTarget;
  const usableTarget = target != null && target > 0 ? target : null;
  const fill = usableTarget == null ? 0 : Math.max(0, Math.min(1, value / usableTarget));
  const unit = kind === 'protein' ? 'g protein' : 'kcal';
  const centre = kind === 'protein' ? String(round1(value)) : Math.round(value).toLocaleString('en-GB');
  let caption = 'Nothing logged today.';
  let status = 'Nothing logged today';
  if (input.logged || value > 0) {
    const shown = kind === 'protein' ? `${round1(value)} g protein` : `${Math.round(value).toLocaleString('en-GB')} kcal`;
    if (usableTarget == null) {
      caption = `${shown} logged. No target yet.`;
      status = 'No target yet';
    } else if (value > usableTarget) {
      const mark = kind === 'protein' ? `${usableTarget} g` : `${usableTarget.toLocaleString('en-GB')} kcal`;
      caption = `${shown} logged, above ${mark}.`;
      if (kind === 'protein') status = 'At your target';
      else status = `${Math.round(value - usableTarget).toLocaleString('en-GB')} kcal over`;
    } else {
      const amount = kind === 'protein' ? String(round1(value)) : Math.round(value).toLocaleString('en-GB');
      const mark = kind === 'protein' ? String(usableTarget) : usableTarget.toLocaleString('en-GB');
      caption = `${amount} of ${mark} ${unit} logged today.`;
      const left = usableTarget - value;
      if (left < (kind === 'protein' ? 0.05 : 1)) status = kind === 'protein' ? 'At your target' : 'On target';
      else status = kind === 'protein'
        ? `${round1(left)} g left`
        : `${Math.round(left).toLocaleString('en-GB')} kcal left`;
    }
  }
  return { kind, value, target: usableTarget, fill, centre, unit, caption, status };
}

export const TODAY_MEALS_EMPTY = 'No meals logged yet today';

/** A longer list starts closed. Five meals still fit on the card. */
export const TODAY_MEALS_COLLAPSE_AFTER = 5;

export type TodayMealRow = {
  id: string;
  meal: MealSlot;
  typeLabel: string;
  name: string;
  kcal: number;
};

export type TodayMealTotals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

function mealWhen(log: FoodLog): string {
  return log.eatenAt || log.createdAt || '';
}

/** This person's meals for one day, earliest first. Another account's rows are left out. */
export function todayMealRows(logs: readonly FoodLog[], day: string, ownerId: string): TodayMealRow[] {
  return logs
    .filter((log) => log.eatenOn === day && log.userId === ownerId)
    .slice()
    .sort((a, b) => mealWhen(a).localeCompare(mealWhen(b)) || a.id.localeCompare(b.id))
    .map((log) => {
      const names = log.items.map((item) => item.name.trim()).filter(Boolean).join(', ');
      return {
        id: log.id,
        meal: log.meal,
        typeLabel: MEAL_LABEL[log.meal],
        name: names || log.note.trim() || 'Meal',
        kcal: sumItems(log.items).kcal,
      };
    });
}

export function todayMealTotals(logs: readonly FoodLog[], day: string, ownerId: string): TodayMealTotals {
  const items = logs
    .filter((log) => log.eatenOn === day && log.userId === ownerId)
    .flatMap((log) => log.items);
  const totals = sumItems(items);
  return {
    kcal: totals.kcal,
    proteinG: totals.proteinG,
    carbsG: totals.carbsG,
    fatG: round1(totals.unsaturatedG + totals.saturatedG + totals.transG),
  };
}

export function todayMealsNeedCollapse(count: number): boolean {
  return count > TODAY_MEALS_COLLAPSE_AFTER;
}

/** kcal, then protein, carbohydrate, and fat when any of those was logged. */
export function todayMealTotalLine(totals: TodayMealTotals, hideCalories: boolean): string {
  const hasMacros = totals.proteinG > 0 || totals.carbsG > 0 || totals.fatG > 0;
  const macros = hasMacros
    ? `Protein ${totals.proteinG} g · carbohydrate ${totals.carbsG} g · fat ${totals.fatG} g`
    : '';
  if (hideCalories) return macros;
  const kcal = `${Math.round(totals.kcal).toLocaleString('en-GB')} kcal`;
  return macros ? `${kcal} · ${macros}` : kcal;
}

export type MacroSlice = { id: 'protein' | 'carbs' | 'fat'; label: string; grams: number; share: number };

export function macroSplit(items: readonly FoodItem[]): { slices: MacroSlice[]; caption: string } {
  const totals = sumItems(items);
  const fat = round1(totals.unsaturatedG + totals.saturatedG + totals.transG);
  const parts = [
    { id: 'protein' as const, label: 'Protein', grams: totals.proteinG },
    { id: 'carbs' as const, label: 'Carbs', grams: totals.carbsG },
    { id: 'fat' as const, label: 'Fat', grams: fat },
  ];
  const sum = parts.reduce((total, part) => total + part.grams, 0);
  if (sum <= 0) return { slices: [], caption: 'Log a meal to see protein, carbohydrate and fat.' };
  return {
    slices: parts.map((part) => ({ ...part, share: part.grams / sum })),
    caption: `Protein ${totals.proteinG} g, carbohydrate ${totals.carbsG} g, fat ${fat} g.`,
  };
}

export type TrendDay = { day: string; kcal: number; proteinG: number; logged: boolean };

export function nutritionTrendDays(logs: readonly FoodLog[], today: string, span: 7 | 30): TrendDay[] {
  const days: TrendDay[] = [];
  for (let ago = span - 1; ago >= 0; ago -= 1) {
    const day = shiftIsoDay(today, -ago);
    const items = dayItems(logs, day);
    const totals = sumItems(items);
    days.push({ day, kcal: totals.kcal, proteinG: totals.proteinG, logged: items.length > 0 });
  }
  return days;
}

export function trendCaption(days: readonly TrendDay[], input: {
  hideCalories: boolean;
  span: 7 | 30;
}): string {
  const logged = days.filter((day) => day.logged);
  if (!logged.length) return input.span === 7 ? WEEK_CHART_EMPTY : 'Log a few meals to see the month.';
  const protein = round1(logged.reduce((sum, day) => sum + day.proteinG, 0) / logged.length);
  if (input.hideCalories) return `Logged days average ${protein} g protein.`;
  const kcal = Math.round(logged.reduce((sum, day) => sum + day.kcal, 0) / logged.length);
  return `Logged days average ${kcal.toLocaleString('en-GB')} kcal and ${protein} g protein.`;
}

export type SmoothWeight = { day: string; kg: number; smooth: number };

/** A three-day average, so a single reading does not spike the line. */
export function smoothWeight(points: readonly { day: string; kg: number }[]): SmoothWeight[] {
  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - 1), Math.min(points.length, index + 2));
    const smooth = round1(window.reduce((sum, item) => sum + item.kg, 0) / window.length);
    return { day: point.day, kg: point.kg, smooth };
  });
}

export type LoggingDot = { day: string; logged: boolean };

export function loggingDots(logs: readonly FoodLog[], today: string): LoggingDot[] {
  const logged = new Set(logs.map((log) => log.eatenOn));
  const dots: LoggingDot[] = [];
  for (let ago = 27; ago >= 0; ago -= 1) {
    const day = shiftIsoDay(today, -ago);
    dots.push({ day, logged: logged.has(day) });
  }
  return dots;
}

export function loggingCaption(logs: readonly FoodLog[], today: string): string {
  const streak = mealStreakDays(logs, today);
  if (streak <= 0) return 'Log a meal and the day gets a dot.';
  return progressShareLine(streak);
}

export function waterProgress(ml: number): { ml: number; mark: number; fill: number; caption: string; status: string } {
  const amount = Math.max(0, Math.round(ml));
  const fill = Math.max(0, Math.min(1, amount / WATER_DAY_ML));
  const caption = amount <= 0
    ? 'No water logged today.'
    : `${amount.toLocaleString('en-GB')} ml of ${WATER_DAY_ML.toLocaleString('en-GB')} ml logged today.`;
  const left = WATER_DAY_ML - amount;
  const status = amount <= 0
    ? 'None logged today'
    : left <= 0
      ? (left === 0 ? "At the day's mark" : `${Math.abs(left).toLocaleString('en-GB')} ml over`)
      : `${left.toLocaleString('en-GB')} ml left`;
  return { ml: amount, mark: WATER_DAY_ML, fill, caption, status };
}

export type EatingInsight = {
  id: 'sleep' | 'mood';
  caption: string;
  leftLabel: string;
  rightLabel: string;
  leftSnacks: number;
  rightSnacks: number;
};

/** Snack counts beside sleep and mood. Absent until both sides of the comparison exist. */
export function eatingInsights(
  logs: readonly FoodLog[],
  checkIns: readonly { createdAt: string; mood: number; sleepHours: number }[],
): EatingInsight[] {
  const days = new Map<string, { snacks: number; mood: number | null; sleepHours: number | null }>();
  for (const log of logs) {
    const row = days.get(log.eatenOn) ?? { snacks: 0, mood: null, sleepHours: null };
    if (log.meal === 'snack') row.snacks += 1;
    days.set(log.eatenOn, row);
  }
  for (const check of checkIns) {
    const day = dayKeyFromStamp(check.createdAt);
    const row = days.get(day) ?? { snacks: 0, mood: null, sleepHours: null };
    row.mood = check.mood;
    row.sleepHours = check.sleepHours;
    days.set(day, row);
  }
  const rows = [...days.values()];
  const insights: EatingInsight[] = [];
  const shortSleep = rows.filter((row) => row.sleepHours != null && row.sleepHours < 6);
  const longerSleep = rows.filter((row) => row.sleepHours != null && row.sleepHours >= 6);
  if (shortSleep.length && longerSleep.length) {
    const left = round1(shortSleep.reduce((sum, row) => sum + row.snacks, 0) / shortSleep.length);
    const right = round1(longerSleep.reduce((sum, row) => sum + row.snacks, 0) / longerSleep.length);
    insights.push({
      id: 'sleep',
      caption: left > right
        ? 'On days you slept under 6 hours, you logged more snacks.'
        : left < right
          ? 'On longer nights, you logged more snacks.'
          : 'Snacks were about the same on short and longer nights.',
      leftLabel: 'Under 6 hours',
      rightLabel: '6 hours or more',
      leftSnacks: left,
      rightSnacks: right,
    });
  }
  const lowMood = rows.filter((row) => row.mood != null && row.mood <= 4);
  const steadier = rows.filter((row) => row.mood != null && row.mood > 4);
  if (lowMood.length && steadier.length) {
    const left = round1(lowMood.reduce((sum, row) => sum + row.snacks, 0) / lowMood.length);
    const right = round1(steadier.reduce((sum, row) => sum + row.snacks, 0) / steadier.length);
    insights.push({
      id: 'mood',
      caption: left > right
        ? 'Lower-mood days had more snacks.'
        : left < right
          ? 'Steadier-mood days had more snacks.'
          : 'Snacks were about the same across those moods.',
      leftLabel: 'Lower mood',
      rightLabel: 'Steadier mood',
      leftSnacks: left,
      rightSnacks: right,
    });
  }
  return insights;
}

export function nutritionContextLines(input: {
  logs: readonly FoodLog[];
  settings: NutritionSettings;
  waterMl: number;
  checkIns: readonly { createdAt: string; mood: number; sleepHours: number }[];
  soberDays: number | null;
  unitsAvoided: number;
  today: string;
  body?: {
    weightKg: number | null;
    heightCm: number | null;
    weights: readonly { day: string; kg: number }[];
    bodyFatPct?: number | null;
    leanMassKg?: number | null;
    waistCm?: number | null;
  };
}): string[] {
  const items = dayItems(input.logs, input.today);
  const totals = sumItems(items);
  const hide = input.settings.hideCalories;
  const lines: string[] = [];
  if (input.settings.wagonOn) {
    lines.push('They have flagged that they have fallen off the wagon. Treat this as a safety moment. Be gentle. Do not shame. Mention the Samaritans on 116 123 and Drinkline on 0300 123 1110.');
    if (input.settings.wagonNote.trim()) lines.push(`Their note, in their words: ${input.settings.wagonNote.trim().slice(0, 200)}`);
  }
  const sugar = sugarCravingNote(input.soberDays);
  if (sugar) lines.push(sugar);
  lines.push(...compositionContextLines({
    settings: input.settings,
    weightKg: input.body?.weightKg ?? null,
    heightCm: input.body?.heightCm ?? null,
    bodyFatPct: input.body?.bodyFatPct ?? null,
    leanMassKg: input.body?.leanMassKg ?? null,
    waistCm: input.body?.waistCm ?? null,
  }));
  if (!hide) {
    const saved = alcoholSavedLine(input.unitsAvoided, false);
    if (saved) lines.push(saved);
  }
  if (items.length) {
    const quality = [
      `protein ${totals.proteinG}g`,
      `carbs ${totals.carbsG}g`,
      `sugar ${totals.sugarG}g`,
      `fibre ${totals.fibreG}g`,
      `unsaturated fat ${totals.unsaturatedG}g`,
      `saturated fat ${totals.saturatedG}g`,
      `trans fat ${totals.transG}g`,
      `sodium ${totals.sodiumMg}mg`,
    ];
    const energy = hide ? 'calories hidden' : `${totals.kcal} kcal, an estimate`;
    lines.push(`Today's food (${input.today}): ${energy}; ${quality.join(', ')}.`);
    const processed = processedLine(items);
    if (processed) lines.push(processed);
    lines.push(fatBalance(items).line);
  }
  if (input.waterMl > 0) lines.push(`Water logged today: ${input.waterMl} ml.`);
  lines.push(...nutritionPatternLines(input.logs, input.checkIns));
  const goal = input.settings.goal;
  if (goal) {
    const weightKg = input.body?.weightKg ?? null;
    const blocked = lossBlocked({
      goal,
      weightKg,
      heightCm: input.body?.heightCm ?? null,
      phase: input.settings.goalPhase,
    });
    lines.push(`Their goal is ${GOAL_LABEL[goal]}.`);
    lines.push(...goalCoachLines(input.settings, input.soberDays != null));
    if (blocked) lines.push('A lower intake is not being suggested.');
    else if (!hide && input.settings.kcalTarget != null) {
      lines.push(`The calorie target they set is ${input.settings.kcalTarget} kcal. One gentle tip is enough. There is no failing a day.`);
    } else if (hide) lines.push('Calories stay hidden. Speak about protein and food quality.');
    else lines.push('Offer one gentle tip that fits this goal.');
    if (input.settings.proteinTarget != null) {
      const mark = totals.proteinG >= input.settings.proteinTarget ? 'at' : 'short of';
      lines.push(`Protein today is ${totals.proteinG} g, ${mark} a target of ${input.settings.proteinTarget} g.`);
    }
    if (input.body?.weights.length) lines.push(weightTrendLine(input.body.weights, goal));
  }
  return lines;
}

/** HealthKit write list. Trans fat has no type, so it is only inside total fat. Unsaturated is saved as monounsaturated. */
export const NUTRITION_HEALTH_WRITES = [
  { identifier: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', unit: 'kcal', key: 'kcal' },
  { identifier: 'HKQuantityTypeIdentifierDietaryProtein', unit: 'g', key: 'proteinG' },
  { identifier: 'HKQuantityTypeIdentifierDietaryCarbohydrates', unit: 'g', key: 'carbsG' },
  { identifier: 'HKQuantityTypeIdentifierDietarySugar', unit: 'g', key: 'sugarG' },
  { identifier: 'HKQuantityTypeIdentifierDietaryFiber', unit: 'g', key: 'fibreG' },
  { identifier: 'HKQuantityTypeIdentifierDietaryFatTotal', unit: 'g', key: 'fatTotal' },
  { identifier: 'HKQuantityTypeIdentifierDietaryFatSaturated', unit: 'g', key: 'saturatedG' },
  { identifier: 'HKQuantityTypeIdentifierDietaryFatMonounsaturated', unit: 'g', key: 'unsaturatedG' },
  { identifier: 'HKQuantityTypeIdentifierDietarySodium', unit: 'g', key: 'sodiumG' },
  { identifier: 'HKQuantityTypeIdentifierDietaryWater', unit: 'mL', key: 'waterMl' },
] as const;

export const NUTRITION_GOALS = [
  'lose_weight',
  'lose_fat_build_muscle',
  'maintain',
  'increase',
  'elite_runner',
  'body_builder',
  'elite_heavy_boxer',
  'elite_middle_boxer',
] as const;
export type NutritionGoal = (typeof NUTRITION_GOALS)[number];
export type NutritionSex = 'female' | 'male';

export const GOAL_LABEL: Record<NutritionGoal, string> = {
  lose_weight: 'Lose Weight',
  lose_fat_build_muscle: 'Lose Fat & Build Muscle',
  maintain: 'Maintain Weight',
  increase: 'Increase Weight',
  elite_runner: 'Elite Athlete (Lean Runner etc.)',
  body_builder: 'Body Builder',
  elite_heavy_boxer: 'Elite Athlete (Heavy Weight Boxer)',
  elite_middle_boxer: 'Elite Athlete (Middle Weight Boxer)',
};

/** One plain sentence under the goal chips. */
export const GOAL_PLAIN: Record<NutritionGoal, string> = {
  lose_weight: 'A modest drop in energy, with enough food to stay well.',
  lose_fat_build_muscle: 'Protein at meals. The scales may stay still while the body changes.',
  maintain: 'Keep the weight you have, with regular meals.',
  increase: 'A little more food, to support a higher weight.',
  elite_runner: 'Higher carbohydrate, moderate protein, and food around training. Lean body composition matters more than the scales.',
  body_builder: 'A surplus for a lean bulk, or a cut phase. Protein stays high. Body fat and lean mass are the marks.',
  elite_heavy_boxer: 'High protein and food around training, to hold size and power. This screen adds a little food. It will not plan a cut.',
  elite_middle_boxer: 'Stay lean around a middleweight limit. Any change is small. A competition weigh-in belongs with a coach and a doctor.',
};

export const BUILDER_PHASES = ['surplus', 'cut'] as const;
export type BuilderPhase = (typeof BUILDER_PHASES)[number];

export const PHASE_LABEL: Record<BuilderPhase, string> = {
  surplus: 'Surplus / lean bulk',
  cut: 'Cut phase',
};

export const COMPETITION_NOTE =
  'A competition weigh-in is a decision for you, a coach, and a doctor. This app will not plan a rapid cut, skipped meals, or dehydration.';

/** Amateur middleweight limit used until the person types their own. */
export const MIDDLEWEIGHT_LIMIT_KG = 75;

export function isTrainingGoal(goal: NutritionGoal | null): boolean {
  return goal === 'elite_runner'
    || goal === 'body_builder'
    || goal === 'elite_heavy_boxer'
    || goal === 'elite_middle_boxer';
}

const LOW_FAT_HOLD =
  'Body fat is already low on this screen. A lower intake is not being suggested. This is not a diagnosis.';

export const LOW_BMI = 18.5;
export const LOW_BMI_NOTE =
  'Your BMI is under 18.5. This app will not suggest eating less. If you are worried about your weight, a GP can help. This is not a diagnosis.';

const MODERATE_ACTIVITY = 1.55;
const MODEST_ADJUSTMENT = 400;
const RECOMP_ADJUSTMENT = 300;

export function isNutritionGoal(value: string): value is NutritionGoal {
  return (NUTRITION_GOALS as readonly string[]).includes(value);
}

export function isNutritionSex(value: string): value is NutritionSex {
  return value === 'female' || value === 'male';
}

/** Mifflin-St Jeor. Sex unset uses the midpoint of the female and male constants. */
export function mifflinBmr(input: { weightKg: number; heightCm: number; age: number; sex: NutritionSex | null }): number | null {
  const { weightKg, heightCm, age, sex } = input;
  if (!(weightKg >= 30 && weightKg <= 300)) return null;
  if (!(heightCm >= 50 && heightCm <= 250)) return null;
  if (!(age >= 18 && age <= 100)) return null;
  const sexTerm = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * age) + sexTerm);
}

export function bmiValue(weightKg: number, heightCm: number): number | null {
  if (!(heightCm >= 50 && heightCm <= 250) || !(weightKg > 0)) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}

export function isBuilderPhase(value: string): value is BuilderPhase {
  return (BUILDER_PHASES as readonly string[]).includes(value);
}

export function lossBlocked(input: {
  goal: NutritionGoal | null;
  weightKg: number | null;
  heightCm: number | null;
  phase?: BuilderPhase | null;
}): boolean {
  const watchesFloor = input.goal === 'lose_weight'
    || input.goal === 'lose_fat_build_muscle'
    || input.goal === 'elite_runner'
    || input.goal === 'elite_middle_boxer'
    || (input.goal === 'body_builder' && input.phase === 'cut');
  if (!watchesFloor) return false;
  if (input.weightKg == null || input.heightCm == null) return false;
  const bmi = bmiValue(input.weightKg, input.heightCm);
  return bmi != null && bmi < LOW_BMI;
}

/** Coach lines for the training goals. Sober recovery stays alcohol-free. */
export function goalCoachLines(
  settings: Pick<NutritionSettings, 'goal' | 'goalPhase' | 'weightClassKg'>,
  sober: boolean,
): string[] {
  const goal = settings.goal;
  if (!isTrainingGoal(goal)) return [];
  const lines: string[] = [];
  if (goal === 'elite_runner') {
    lines.push('Elite endurance goal. Suggest carbohydrate around training and moderate protein, about 1.6 to 1.8 g per kg. Lean body composition matters more than the scales. Do not suggest an aggressive deficit.');
  }
  if (goal === 'body_builder') {
    const phase = settings.goalPhase === 'cut'
      ? 'They chose a cut phase. Keep any deficit modest, and do not suggest skipping meals.'
      : 'They are on a surplus or lean bulk unless they chose a cut. Do not suggest an aggressive deficit.';
    lines.push(`Body building goal. Protein sits around 2.0 to 2.4 g per kg. Talk about body fat and lean mass, not the scales alone. ${phase}`);
  }
  if (goal === 'elite_heavy_boxer') {
    lines.push('Heavyweight boxing goal. High protein, about 2.2 g per kg, and food around training. The aim is size and power: maintain or build mass. Do not suggest a deficit, a rapid cut, or skipped meals.');
  }
  if (goal === 'elite_middle_boxer') {
    const klass = settings.weightClassKg != null
      ? ` They noted a middleweight limit of ${settings.weightClassKg} kg.`
      : ` Until they type their own, the screen uses ${MIDDLEWEIGHT_LIMIT_KG} kg as the middleweight limit.`;
    lines.push(`Middleweight boxing goal. High protein and tighter weight management, kept to a small change.${klass} ${COMPETITION_NOTE}`);
  }
  if (sober) lines.push('They are on a sober path. Recovery tips stay alcohol-free: food, water, sleep, and a soft drink if they want one.');
  return lines;
}

export function isBodyBuild(value: string): value is BodyBuild {
  return (BODY_BUILDS as readonly string[]).includes(value);
}

export function isBodyCompositionSource(value: string): value is BodyCompositionSource {
  return value === 'healthkit' || (BODY_ENTRY_SOURCES as readonly string[]).includes(value);
}

/** HealthKit may send a fraction (0.15) or a percent (15). Stored values are percents from 2 to 70. */
export function parseBodyFatPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const pct = value <= 1 ? value * 100 : value;
  if (pct < 2 || pct > 70) return null;
  return Math.round(pct * 10) / 10;
}

export function parseLeanMassKg(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 20 || value > 200) return null;
  return Math.round(value * 10) / 10;
}

export const CM_PER_INCH = 2.54;

export function parseWaistCm(value: number | null | undefined, unit: 'cm' | 'in'): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const cm = unit === 'in' ? value * CM_PER_INCH : value;
  if (cm < 40 || cm > 200) return null;
  return Math.round(cm * 10) / 10;
}

export function waistToHeight(waistCm: number, heightCm: number): number | null {
  if (!(waistCm > 0) || !(heightCm >= 50 && heightCm <= 250)) return null;
  return Math.round((waistCm / heightCm) * 100) / 100;
}

function fatBand(sex: NutritionSex | null): { low: number; high: number } {
  if (sex === 'female') return { low: BODY_FAT_LOW.female, high: BODY_FAT_HIGH.female };
  if (sex === 'male') return { low: BODY_FAT_LOW.male, high: BODY_FAT_HIGH.male };
  return { low: BODY_FAT_LOW.unset, high: BODY_FAT_HIGH.unset };
}

/**
 * Body fat, then waist-to-height, then BMI.
 * Category labels stay off for a muscular build unless BMI is under 18.5.
 */
export function assessWeight(input: {
  bodyFatPct?: number | null;
  waistCm?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  build?: BodyBuild | null;
  sex?: NutritionSex | null;
}): WeightAssessment {
  const fat = input.bodyFatPct != null && input.bodyFatPct >= 2 && input.bodyFatPct <= 70 ? input.bodyFatPct : null;
  if (fat != null) {
    const band = fatBand(input.sex ?? null);
    const label = fat < band.low ? 'Low body fat' : fat >= band.high ? 'Above the body-fat band' : 'Within the body-fat band';
    return {
      basis: 'body_fat',
      label,
      plain: `Body fat is ${plainMeasure(fat)}%. That is used instead of a BMI category. These bands describe this screen. They are not a diagnosis.`,
      hideBmiCategory: true,
      underweight: false,
    };
  }
  const ratio = input.waistCm != null && input.heightCm != null ? waistToHeight(input.waistCm, input.heightCm) : null;
  if (ratio != null) {
    const healthy = ratio < WAIST_HEIGHT_HEALTHY;
    return {
      basis: 'waist',
      label: healthy ? 'Within the healthy band' : 'Outside the healthy band',
      plain: healthy
        ? `Waist is less than half your height (waist-to-height ${ratio.toFixed(2)}). Under 0.5 is the healthy band on this screen.`
        : `Waist-to-height is ${ratio.toFixed(2)}. 0.5 or more sits outside the healthy band on this screen. This is not a diagnosis.`,
      hideBmiCategory: true,
      underweight: false,
    };
  }
  const bmi = input.weightKg != null && input.heightCm != null ? bmiValue(input.weightKg, input.heightCm) : null;
  if (bmi == null) {
    return { basis: 'none', label: null, plain: '', hideBmiCategory: false, underweight: false };
  }
  const underweight = bmi < LOW_BMI;
  if (input.build === 'muscular' && !underweight) {
    return {
      basis: 'bmi',
      label: null,
      plain: `BMI is ${bmi.toFixed(1)}. Category labels stay off because you lift weights. ${BMI_ONLY_NOTE}`,
      hideBmiCategory: true,
      underweight: false,
    };
  }
  if (underweight) {
    return {
      basis: 'bmi',
      label: 'Below the healthy range',
      plain: `BMI is ${bmi.toFixed(1)}, under 18.5. ${BMI_ONLY_NOTE}`,
      hideBmiCategory: false,
      underweight: true,
    };
  }
  return {
    basis: 'bmi',
    label: null,
    plain: `BMI is ${bmi.toFixed(1)}. ${BMI_ONLY_NOTE}`,
    hideBmiCategory: false,
    underweight: false,
  };
}

/** Latest value of each measure. A newer waist does not hide an earlier body-fat reading. */
export function compositionForAssessment(rows: readonly BodyCompositionReading[]): {
  bodyFatPct: number | null;
  leanMassKg: number | null;
  waistCm: number | null;
} {
  const ordered = [...rows].sort((left, right) => right.recordedOn.localeCompare(left.recordedOn) || right.createdAt.localeCompare(left.createdAt));
  return {
    bodyFatPct: ordered.find((row) => row.bodyFatPct != null)?.bodyFatPct ?? null,
    leanMassKg: ordered.find((row) => row.leanMassKg != null)?.leanMassKg ?? null,
    waistCm: ordered.find((row) => row.waistCm != null)?.waistCm ?? null,
  };
}

function plainMeasure(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
}

/** Measured lean mass when it is present, otherwise weight with body fat removed. Needs body fat. */
export function fatFreeMassKg(input: { weightKg: number | null; bodyFatPct: number | null; leanMassKg: number | null }): number | null {
  if (input.bodyFatPct == null || input.bodyFatPct < 2 || input.bodyFatPct > 70) return null;
  if (input.leanMassKg != null && input.leanMassKg >= 20 && input.leanMassKg <= 200) return Math.round(input.leanMassKg * 10) / 10;
  if (input.weightKg == null || !(input.weightKg > 0)) return null;
  const lean = input.weightKg * (1 - input.bodyFatPct / 100);
  if (lean < 20 || lean > 200) return null;
  return Math.round(lean * 10) / 10;
}

export function ffmiValue(leanKg: number, heightCm: number): number | null {
  if (!(heightCm >= 50 && heightCm <= 250) || !(leanKg > 0)) return null;
  const metres = heightCm / 100;
  return Math.round((leanKg / (metres * metres)) * 10) / 10;
}

/** Descriptive words for this screen. Not an NHS category. */
export function ffmiPlain(input: { ffmi: number; sex: NutritionSex | null }): string {
  const cuts = input.sex === 'female' ? [15, 17, 19] : input.sex === 'male' ? [18, 20, 22] : [16, 18, 20];
  const word = input.ffmi < cuts[0]
    ? 'a lighter amount of muscle'
    : input.ffmi < cuts[1]
      ? 'an ordinary amount of muscle'
      : input.ffmi < cuts[2]
        ? 'more muscle than is typical'
        : 'a muscular amount of muscle';
  return `Fat-free mass index is ${input.ffmi.toFixed(1)}, which on this screen reads as ${word}. This is not a diagnosis.`;
}

/** A short line for the progress share. Null when there is nothing to say. */
export function compositionShareLine(input: {
  bodyFatPct: number | null;
  leanMassKg: number | null;
  waistCm: number | null;
  heightCm: number | null;
}): string | null {
  if (input.bodyFatPct != null && input.bodyFatPct >= 2 && input.bodyFatPct <= 70) {
    return `Body fat ${plainMeasure(input.bodyFatPct)}%.`;
  }
  const ratio = input.waistCm != null && input.heightCm != null ? waistToHeight(input.waistCm, input.heightCm) : null;
  if (ratio != null) {
    return ratio < WAIST_HEIGHT_HEALTHY
      ? 'Waist is less than half their height.'
      : 'Waist-to-height is 0.5 or more.';
  }
  if (input.leanMassKg != null) return 'Lean body mass is recorded.';
  return null;
}

export function compositionContextLines(input: {
  settings: Pick<NutritionSettings, 'build' | 'goalSex'>;
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  leanMassKg?: number | null;
  waistCm?: number | null;
}): string[] {
  const lines: string[] = [];
  if (input.settings.build) lines.push(`Their build is ${BUILD_LABEL[input.settings.build]}.`);
  const assessment = assessWeight({
    bodyFatPct: input.bodyFatPct ?? null,
    waistCm: input.waistCm ?? null,
    weightKg: input.weightKg ?? null,
    heightCm: input.heightCm ?? null,
    build: input.settings.build,
    sex: input.settings.goalSex,
  });
  if (assessment.basis !== 'none' && assessment.plain) lines.push(assessment.plain);
  if (assessment.hideBmiCategory) lines.push('Do not call them overweight or obese from BMI.');
  const lean = fatFreeMassKg({
    weightKg: input.weightKg ?? null,
    bodyFatPct: input.bodyFatPct ?? null,
    leanMassKg: input.leanMassKg ?? null,
  });
  const ffmi = lean != null && input.heightCm != null ? ffmiValue(lean, input.heightCm) : null;
  if (ffmi != null) lines.push(ffmiPlain({ ffmi, sex: input.settings.goalSex }));
  return lines;
}

/** Never under BMR, and never under 1,200 kcal for women or 1,500 for men. Sex unset uses 1,500. */
export function kcalFloor(bmr: number, sex: NutritionSex | null): number {
  const sexFloor = sex === 'female' ? 1200 : 1500;
  return Math.max(Math.round(bmr), sexFloor);
}

/**
 * Muscular uses 2 g per kg on the original goals, inside 1.8 to 2.2.
 * Runner, body builder, and the two boxer goals keep their own rates. Capped at 700 g.
 */
export function proteinGramsFor(
  goal: NutritionGoal,
  weightKg: number,
  build: BodyBuild | null = null,
  phase: BuilderPhase | null = null,
): number {
  const perKg = goal === 'elite_runner'
    ? (build === 'muscular' ? 1.8 : 1.7)
    : goal === 'body_builder'
      ? (phase === 'cut' ? 2.4 : 2.2)
      : goal === 'elite_heavy_boxer'
        ? 2.2
        : goal === 'elite_middle_boxer'
          ? (build === 'muscular' ? 2.2 : 2)
          : build === 'muscular'
          ? 2
          : goal === 'lose_fat_build_muscle'
            ? 1.8
            : goal === 'maintain'
              ? 1.2
              : 1.6;
  return Math.min(700, Math.round(perKg * weightKg));
}

const ATHLETE_DEFICIT = 200;
const LEAN_BULK = 300;

function carbShareFor(goal: NutritionGoal): number {
  if (goal === 'elite_runner') return 0.7;
  if (goal === 'elite_heavy_boxer') return 0.62;
  if (goal === 'elite_middle_boxer') return 0.55;
  if (goal === 'body_builder') return 0.5;
  return 0.55;
}

/** Protein is taken first. Fat stays at least a fifth of the calories. */
export function macroGramsFor(kcal: number, proteinG: number, goal: NutritionGoal): { carbG: number; fatG: number } {
  const remaining = Math.max(0, kcal - proteinG * 4);
  let carbKcal = Math.round(remaining * carbShareFor(goal));
  let fatKcal = remaining - carbKcal;
  const fatFloor = Math.round(kcal * 0.2);
  if (fatKcal < fatFloor) {
    fatKcal = Math.min(fatFloor, remaining);
    carbKcal = remaining - fatKcal;
  }
  return {
    carbG: Math.min(1000, Math.max(0, Math.round(carbKcal / 4))),
    fatG: Math.min(400, Math.max(0, Math.round(fatKcal / 9))),
  };
}

export type GoalSuggestion = {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  bmr: number;
  floor: number;
  bmi: number | null;
  blockedLoss: boolean;
  usedActiveEnergy: boolean;
  basis: WeightAssessment['basis'];
  note: string;
};

export type GoalMeasureFrom = 'box' | 'health' | 'profile' | 'typed';

export type GoalBody = {
  weightKg: number | null;
  heightCm: number | null;
  weightFrom: GoalMeasureFrom | null;
  heightFrom: GoalMeasureFrom | null;
};

/** Names every missing measure. Weight and height together use one sentence. */
export function missingGoalBodyMessage(input: { weightKg: number | null; heightCm: number | null }): string | null {
  const weight = input.weightKg == null;
  const height = input.heightCm == null;
  if (weight && height) return 'Add your weight and height';
  if (weight) return 'Add your weight';
  if (height) return 'Add your height';
  return null;
}

/**
 * Latest weight wins: a typed value, otherwise the later of the weight box and Apple Health.
 * Height is the typed value, otherwise the profile, otherwise Apple Health.
 */
export function goalBodyForSuggestion(input: {
  box: { kg: number; day: string } | null;
  healthWeight: { kg: number; day: string } | null;
  profileHeightCm: number | null;
  healthHeightCm: number | null;
  typedWeightKg: number | null;
  typedHeightCm: number | null;
}): GoalBody {
  let weightKg: number | null = null;
  let weightFrom: GoalMeasureFrom | null = null;
  if (input.typedWeightKg != null) {
    weightKg = input.typedWeightKg;
    weightFrom = 'typed';
  } else if (input.box && input.healthWeight) {
    const healthLater = input.healthWeight.day >= input.box.day;
    weightKg = healthLater ? input.healthWeight.kg : input.box.kg;
    weightFrom = healthLater ? 'health' : 'box';
  } else if (input.healthWeight) {
    weightKg = input.healthWeight.kg;
    weightFrom = 'health';
  } else if (input.box) {
    weightKg = input.box.kg;
    weightFrom = 'box';
  }

  let heightCm: number | null = null;
  let heightFrom: GoalMeasureFrom | null = null;
  if (input.typedHeightCm != null) {
    heightCm = input.typedHeightCm;
    heightFrom = 'typed';
  } else if (input.profileHeightCm != null) {
    heightCm = input.profileHeightCm;
    heightFrom = 'profile';
  } else if (input.healthHeightCm != null) {
    heightCm = input.healthHeightCm;
    heightFrom = 'health';
  }

  return { weightKg, heightCm, weightFrom, heightFrom };
}

export function suggestedTargetsLine(input: {
  kcal: number;
  proteinG: number;
  hideCalories: boolean;
  carbG?: number | null;
  fatG?: number | null;
}): string {
  const macros = input.carbG != null && input.fatG != null
    ? `, ${input.carbG} g carbohydrate, and ${input.fatG} g fat`
    : '';
  if (input.hideCalories) return `Suggested ${input.proteinG} g protein${macros}.`;
  return `Suggested ${input.kcal.toLocaleString('en-GB')} kcal and ${input.proteinG} g protein${macros}.`;
}

export function suggestGoalTargets(input: {
  goal: NutritionGoal;
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: NutritionSex | null;
  activeEnergyKcal: number | null;
  /** Muscular raises protein only on the original goals. The under-18.5 floor still blocks a deficit. */
  build?: BodyBuild | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  phase?: BuilderPhase | null;
  weightClassKg?: number | null;
}): { ok: true; suggestion: GoalSuggestion } | { ok: false; message: string } {
  if (input.weightKg == null || input.heightCm == null) {
    return { ok: false, message: missingGoalBodyMessage(input) ?? 'Add your weight and height' };
  }
  if (input.age == null) return { ok: false, message: 'Add your age, then a target can be suggested. You can still type your own.' };
  const bmr = mifflinBmr({ weightKg: input.weightKg, heightCm: input.heightCm, age: input.age, sex: input.sex });
  if (bmr == null) return { ok: false, message: 'Age sits between 18 and 100, and weight and height need to be in the usual adult range.' };
  const floor = kcalFloor(bmr, input.sex);
  const bmi = bmiValue(input.weightKg, input.heightCm);
  const active = input.activeEnergyKcal;
  const usedActiveEnergy = active != null && active >= 0 && active <= 2500;
  const tdee = usedActiveEnergy ? bmr + Math.round(active) : Math.round(bmr * MODERATE_ACTIVITY);
  const assessment = assessWeight({
    bodyFatPct: input.bodyFatPct ?? null,
    waistCm: input.waistCm ?? null,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    build: input.build ?? null,
    sex: input.sex,
  });
  const lowFat = assessment.label === 'Low body fat';
  const phase = input.phase === 'surplus' || input.phase === 'cut' ? input.phase : null;
  const weightClass = input.weightClassKg != null && input.weightClassKg >= 40 && input.weightClassKg <= 200
    ? input.weightClassKg
    : null;
  const lossGoal = input.goal === 'lose_weight' || input.goal === 'lose_fat_build_muscle';
  const cutPhase = input.goal === 'body_builder' && phase === 'cut';
  const athleteFloor = input.goal === 'elite_runner' || input.goal === 'elite_middle_boxer' || cutPhase;
  const blockedLoss = (lossGoal || athleteFloor) && bmi != null && bmi < LOW_BMI;
  let kcal = tdee;
  let classCut = false;
  if (!blockedLoss && input.goal === 'lose_weight') kcal = tdee - MODEST_ADJUSTMENT;
  if (!blockedLoss && input.goal === 'lose_fat_build_muscle') kcal = tdee - RECOMP_ADJUSTMENT;
  if (input.goal === 'increase') kcal = tdee + MODEST_ADJUSTMENT;
  if (input.goal === 'elite_runner') {
    const room = !blockedLoss && !lowFat && (
      assessment.label === 'Above the body-fat band' || assessment.label === 'Outside the healthy band'
    );
    if (room) kcal = tdee - ATHLETE_DEFICIT;
  }
  if (input.goal === 'body_builder') {
    if (cutPhase && !blockedLoss && !lowFat) kcal = tdee - RECOMP_ADJUSTMENT;
    else if (!cutPhase) kcal = tdee + LEAN_BULK;
  }
  if (input.goal === 'elite_heavy_boxer') kcal = tdee + ATHLETE_DEFICIT;
  const middleLimit = input.goal === 'elite_middle_boxer' ? (weightClass ?? MIDDLEWEIGHT_LIMIT_KG) : null;
  if (middleLimit != null && middleLimit < input.weightKg - 0.5) {
    classCut = true;
    if (!blockedLoss && !lowFat) kcal = tdee - ATHLETE_DEFICIT;
  }
  kcal = Math.max(kcal, floor);
  const proteinG = proteinGramsFor(input.goal, input.weightKg, input.build ?? null, phase);
  const macros = macroGramsFor(kcal, proteinG, input.goal);
  const activityLine = usedActiveEnergy
    ? 'It uses your recent Apple Health active energy.'
    : 'It assumes a moderately active day. Apple Health active energy will refine it when that reading is available.';
  const sexLine = input.sex == null ? ' Sex was not set, so the estimate sits between the female and male equations.' : '';
  const athlete = isTrainingGoal(input.goal);
  const liftLine = !blockedLoss && !athlete && input.build === 'muscular'
    ? ' Protein uses 2 g per kg, inside 1.8 to 2.2 g per kg, because you lift weights.'
    : '';
  const basisLine = assessment.basis === 'body_fat'
    ? ' Body fat is used before waist or BMI.'
    : assessment.basis === 'waist'
      ? ' Waist-to-height is used before BMI.'
      : assessment.basis === 'bmi'
        ? ' Only BMI is available, so that is what this suggestion uses.'
        : '';
  const athleteLine = input.goal === 'elite_runner'
    ? ` Protein is about ${input.build === 'muscular' ? '1.8' : '1.7'} g per kg, inside 1.6 to 1.8. Carbohydrate is the larger share, for fuelling around training.`
    : input.goal === 'body_builder'
      ? ` Protein is about ${phase === 'cut' ? '2.4' : '2.2'} g per kg, inside 2.0 to 2.4. ${phase === 'cut' ? 'This cut is 300 kcal under a maintenance estimate.' : phase === 'surplus' ? 'This is a lean bulk, 300 kcal over a maintenance estimate.' : 'A lean bulk is used until you choose a cut.'}`
      : input.goal === 'elite_heavy_boxer'
        ? ' Protein is about 2.2 g per kg, for size and power. This is 200 kcal over a maintenance estimate, to hold mass. Carbohydrate stays high enough to fuel the sessions.'
        : input.goal === 'elite_middle_boxer'
          ? ` Protein is about ${input.build === 'muscular' ? '2.2' : '2'} g per kg. The middleweight limit on this screen is ${middleLimit} kg${weightClass == null ? ' until you type your own' : ''}. Above that limit the suggestion is 200 kcal under maintenance, and no more. At or under it, the suggestion stays at maintenance.`
          : '';
  const safetyLine = !blockedLoss && lowFat && (input.goal === 'elite_runner' || cutPhase || classCut)
    ? ` ${LOW_FAT_HOLD}`
    : '';
  const classLine = input.goal === 'elite_heavy_boxer' || input.goal === 'elite_middle_boxer'
    ? ` ${COMPETITION_NOTE}`
    : '';
  const note = blockedLoss
    ? LOW_BMI_NOTE
    : `A starting suggestion from the Mifflin-St Jeor equation. ${activityLine}${sexLine}${basisLine}${athleteLine}${liftLine}${safetyLine}${classLine} Change it if it does not suit you. This is not medical advice.`;
  return {
    ok: true,
    suggestion: {
      kcal,
      proteinG,
      carbG: macros.carbG,
      fatG: macros.fatG,
      bmr,
      floor,
      bmi,
      blockedLoss,
      usedActiveEnergy,
      basis: assessment.basis,
      note,
    },
  };
}

export function macroDayLine(input: {
  carbsG: number;
  carbTarget: number | null;
  fatG: number;
  fatTarget: number | null;
}): string | null {
  const parts: string[] = [];
  if (input.carbTarget != null) {
    parts.push(input.carbsG >= input.carbTarget
      ? `Carbohydrate is at ${input.carbTarget} g.`
      : `Carbohydrate is ${Math.round(input.carbsG)} g towards ${input.carbTarget} g.`);
  }
  if (input.fatTarget != null) {
    parts.push(input.fatG >= input.fatTarget
      ? `Fat is at ${input.fatTarget} g.`
      : `Fat is ${Math.round(input.fatG)} g towards ${input.fatTarget} g.`);
  }
  return parts.length ? parts.join(' ') : null;
}

export function goalDayLine(input: {
  goal: NutritionGoal;
  hideCalories: boolean;
  kcal: number;
  kcalTarget: number | null;
  proteinG: number;
  proteinTarget: number | null;
  blockedLoss: boolean;
  carbsG?: number;
  carbTarget?: number | null;
  fatG?: number;
  fatTarget?: number | null;
}): string {
  const parts = [`Goal: ${GOAL_LABEL[input.goal]}.`];
  if (input.blockedLoss) parts.push('A lower intake is not being suggested.');
  if (input.goal === 'elite_runner') parts.push('Fuelling around training matters more than one day on the scales.');
  if (input.goal === 'body_builder') parts.push('Body fat and lean mass matter more than one day on the scales.');
  if (input.goal === 'elite_heavy_boxer') parts.push('Size and power matter more than one day on the scales.');
  if (input.goal === 'elite_middle_boxer') parts.push('A middleweight limit is not decided on this screen.');
  if (input.proteinTarget != null) {
    parts.push(input.proteinG >= input.proteinTarget
      ? `Protein is at ${input.proteinTarget} g.`
      : `Protein is ${input.proteinG} g towards ${input.proteinTarget} g.`);
  }
  const macros = macroDayLine({
    carbsG: input.carbsG ?? 0,
    carbTarget: input.carbTarget ?? null,
    fatG: input.fatG ?? 0,
    fatTarget: input.fatTarget ?? null,
  });
  if (macros) parts.push(macros);
  if (!input.hideCalories && input.kcalTarget != null && !input.blockedLoss) {
    parts.push(input.kcal <= input.kcalTarget
      ? 'Energy is within the target you set.'
      : 'Energy is above the target you set. There is no failing a day.');
  }
  if (input.hideCalories) parts.push('Calories stay hidden. Protein and food quality are the marks on this screen.');
  return parts.join(' ');
}

export type WeightDirection = 'down' | 'up' | 'steady' | 'unknown';

export function weightPointsFrom(samples: readonly { kind: string; value: number; recordedOn: string }[]): { day: string; kg: number }[] {
  const byDay = new Map<string, number>();
  for (const sample of samples) {
    if (sample.kind !== 'weight_kg' || !(sample.value > 0)) continue;
    const day = sample.recordedOn.slice(0, 10);
    byDay.set(day, sample.value);
  }
  return [...byDay.entries()]
    .map(([day, kg]) => ({ day, kg }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

export function weightDirection(points: readonly { day: string; kg: number }[]): WeightDirection {
  if (points.length < 2) return 'unknown';
  const ordered = [...points].sort((left, right) => left.day.localeCompare(right.day));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return 'unknown';
  const delta = last.kg - first.kg;
  if (delta <= -0.3) return 'down';
  if (delta >= 0.3) return 'up';
  return 'steady';
}

export function weightTrendLine(points: readonly { day: string; kg: number }[], goal: NutritionGoal | null): string {
  const direction = weightDirection(points);
  if (direction === 'unknown') return 'Log weight more than once and a trend can sit here. The number stays on this screen.';
  if (goal === 'lose_fat_build_muscle') {
    return 'For losing fat and building muscle, the scales can stay still while the body changes. Protein is the clearer daily mark.';
  }
  if (goal === 'elite_runner') {
    return 'For endurance training, a small change on the scales is not the mark. Body fat and how the sessions feel matter more.';
  }
  if (goal === 'body_builder') {
    return 'For building muscle, body fat and lean mass matter more than the scales. The scales can stay still while the body changes.';
  }
  if (goal === 'elite_heavy_boxer') {
    return 'For a heavyweight, size and power matter more than a small change on the scales.';
  }
  if (goal === 'elite_middle_boxer') {
    return 'A middleweight limit is not a race. This screen will not treat a reading as a cut. Speak to a coach and a doctor before a competition weigh-in.';
  }
  if (goal === 'lose_weight' && direction === 'down') return 'Weight is lower than the earlier reading. That is a gentle move, not a race.';
  if (goal === 'lose_weight' && direction === 'up') return 'Weight is higher than the earlier reading. Days vary. There is no failing a week.';
  if (goal === 'increase' && direction === 'up') return 'Weight is higher than the earlier reading.';
  if (goal === 'increase' && direction === 'down') return 'Weight is lower than the earlier reading. If that was not the aim, a GP can help.';
  if (goal === 'maintain' && direction === 'steady') return 'Weight has stayed near the earlier reading.';
  if (direction === 'down') return 'Weight is lower than the earlier reading.';
  if (direction === 'up') return 'Weight is higher than the earlier reading.';
  return 'Weight has stayed near the earlier reading.';
}

/** Body fat, then lean mass. Only the training goals ask for this line. */
export function compositionTrendLine(rows: readonly BodyCompositionReading[], goal: NutritionGoal | null): string | null {
  if (!isTrainingGoal(goal)) return null;
  const ordered = [...rows].sort((left, right) => left.recordedOn.localeCompare(right.recordedOn) || left.createdAt.localeCompare(right.createdAt));
  const fats = ordered.filter((row) => row.bodyFatPct != null);
  const leans = ordered.filter((row) => row.leanMassKg != null);
  const shift = (latest: number, earlier: number): 'down' | 'up' | 'steady' => {
    const delta = latest - earlier;
    if (delta <= -0.3) return 'down';
    if (delta >= 0.3) return 'up';
    return 'steady';
  };
  const parts: string[] = [];
  if (fats.length >= 2) {
    const earlier = fats[0]?.bodyFatPct;
    const latest = fats[fats.length - 1]?.bodyFatPct;
    if (earlier != null && latest != null) {
      const moved = shift(latest, earlier);
      parts.push(moved === 'down'
        ? 'Body fat is lower than the earlier reading.'
        : moved === 'up'
          ? 'Body fat is higher than the earlier reading.'
          : 'Body fat has stayed near the earlier reading.');
    }
  }
  if (leans.length >= 2 && goal === 'body_builder') {
    const earlier = leans[0]?.leanMassKg;
    const latest = leans[leans.length - 1]?.leanMassKg;
    if (earlier != null && latest != null) {
      const moved = shift(latest, earlier);
      parts.push(moved === 'up'
        ? 'Lean mass is higher than the earlier reading.'
        : moved === 'down'
          ? 'Lean mass is lower than the earlier reading.'
          : 'Lean mass has stayed near the earlier reading.');
    }
  }
  if (!parts.length) {
    if (goal === 'body_builder') return 'Log body fat and lean mass more than once and a trend can sit here.';
    if (goal === 'elite_heavy_boxer') return 'Log body fat and lean mass more than once and a trend can sit here. Size and power are the marks.';
    if (goal === 'elite_middle_boxer') return 'Log body fat more than once and a trend can sit here. A middleweight limit is not a race.';
    return 'Log body fat more than once and a trend can sit here. The scales are not the only mark.';
  }
  if (goal === 'elite_middle_boxer') parts.push('Speak to a coach and a doctor before a competition weigh-in.');
  if (goal === 'elite_heavy_boxer') parts.push('Size and power matter more than the scales alone.');
  return parts.join(' ');
}

export function goalMealNote(input: {
  goal: NutritionGoal | null;
  items: readonly FoodItem[];
  hideCalories: boolean;
  blockedLoss: boolean;
}): string | null {
  if (!input.goal || !input.items.length) return null;
  if (input.blockedLoss) return 'This is an estimate. A lower intake is not being suggested.';
  const totals = sumItems(input.items);
  const protein = `About ${totals.proteinG} g protein.`;
  const energy = input.hideCalories ? '' : `About ${totals.kcal.toLocaleString('en-GB')} kcal. `;
  const fit = input.goal === 'lose_fat_build_muscle'
    ? ' Protein at this meal helps the muscle side of the goal.'
    : input.goal === 'elite_runner'
      ? ' Carbohydrate at this meal helps the training.'
      : input.goal === 'body_builder'
        ? ' Protein at this meal supports the muscle work.'
        : input.goal === 'elite_heavy_boxer'
          ? ' A meal around training supports size and power.'
          : input.goal === 'elite_middle_boxer'
            ? ' A meal around training still counts. One meal does not make a weight class.'
          : input.goal === 'increase'
            ? ' A bit more at meals can support a higher weight.'
            : input.goal === 'lose_weight'
              ? ' One meal does not decide the day.'
              : ' A steady meal still counts.';
  return `${energy}${protein}${fit}`.trim();
}

export function goalShareLine(input: {
  goal: NutritionGoal;
  proteinG: number | null;
  proteinTarget: number | null;
  direction: WeightDirection;
  hideCalories: boolean;
  blockedLoss: boolean;
}): string {
  const parts = [GOAL_LABEL[input.goal]];
  if (input.blockedLoss) parts.push('A lower intake is not being suggested.');
  else if (input.proteinTarget != null && input.proteinG != null) {
    parts.push(input.proteinG >= input.proteinTarget ? 'Protein is at the target today.' : 'Protein is still short of the target today.');
  }
  if (isTrainingGoal(input.goal)) {
    parts.push('Progress on this goal is about training, recovery, and body composition.');
    if (input.hideCalories) parts.push('Calories are not part of this share.');
    return parts.join(' ');
  }
  if (input.direction === 'down') parts.push('Weight has eased down across recent readings.');
  else if (input.direction === 'up') parts.push('Weight has risen across recent readings.');
  else if (input.direction === 'steady') parts.push('Weight has stayed near the earlier reading.');
  if (input.hideCalories) parts.push('Calories are not part of this share.');
  return parts.join(' ');
}

export type SharedGoal = { label: string; line: string };

export type SharedQuality = { unsaturated: number; other: number; line: string };

export type SharedNutritionView = {
  /** Null when that switch is off. An empty list means meals are shared and today is blank. */
  meals: { meal: string; detail: string }[] | null;
  calories: string | null;
  quality: SharedQuality | null;
  progress: string | null;
  wagon: { note: string } | null;
  /** Goal name and a qualitative line. Null when that switch is off. No kilograms and no kcal. */
  goal: SharedGoal | null;
};

function sharedGoalFrom(
  settings: NutritionSettings,
  logs: readonly FoodLog[],
  today: string,
  body?: { heightCm?: number | null; weights?: readonly { day: string; kg: number }[] },
): SharedGoal | null {
  if (!settings.shareGoal || !settings.goal) return null;
  const weights = body?.weights ?? [];
  const ordered = [...weights].sort((left, right) => left.day.localeCompare(right.day));
  const latest = ordered.length ? ordered[ordered.length - 1] : undefined;
  const totals = sumItems(dayItems(logs, today));
  return {
    label: GOAL_LABEL[settings.goal],
    line: goalShareLine({
      goal: settings.goal,
      proteinG: totals.proteinG,
      proteinTarget: settings.proteinTarget,
      direction: weightDirection(weights),
      hideCalories: settings.hideCalories,
      blockedLoss: lossBlocked({
        goal: settings.goal,
        weightKg: latest?.kg ?? null,
        heightCm: body?.heightCm ?? null,
        phase: settings.goalPhase,
      }),
    }),
  };
}

/** What another member may see. Each field is null unless its own switch is on. */
export function presentSharedNutrition(
  settings: NutritionSettings,
  logs: readonly FoodLog[],
  today: string,
  body?: {
    heightCm?: number | null;
    weights?: readonly { day: string; kg: number }[];
    bodyFatPct?: number | null;
    leanMassKg?: number | null;
    waistCm?: number | null;
  },
): SharedNutritionView {
  const items = dayItems(logs, today);
  const balance = fatBalance(items);
  const streak = progressShareLine(mealStreakDays(logs, today));
  const composition = compositionShareLine({
    bodyFatPct: body?.bodyFatPct ?? null,
    leanMassKg: body?.leanMassKg ?? null,
    waistCm: body?.waistCm ?? null,
    heightCm: body?.heightCm ?? null,
  });
  return {
    meals: settings.shareFoodDiary ? publicMealLines(logs, today) : null,
    calories: settings.shareCalories ? caloriesShareLine(items, settings.hideCalories) : null,
    quality: settings.shareQuality
      ? { unsaturated: balance.unsaturated, other: balance.other, line: balance.line }
      : null,
    progress: settings.shareProgress ? [streak, composition].filter(Boolean).join(' ') : null,
    wagon: settings.wagonOn && settings.wagonVisible ? { note: settings.wagonNote.trim().slice(0, 200) } : null,
    goal: sharedGoalFrom(settings, logs, today, body),
  };
}

/** Reads shared_nutrition. Null means the profile is hidden or blocked. */
function sharedMealRows(raw: Record<string, unknown>): { meal: string; detail: string }[] | null {
  if (raw.mealsShared === false) return null;
  if (!Array.isArray(raw.meals)) return raw.mealsShared === true ? [] : null;
  return raw.meals.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const slot = typeof item.meal === 'string' && isMealSlot(item.meal) ? item.meal : null;
    const fromNames = typeof item.names === 'string' ? item.names.trim() : '';
    const foods = Array.isArray(item.items)
      ? item.items.map(foodItemFromUnknown).filter((food): food is FoodItem => food != null)
      : [];
    const names = fromNames || foods.map((food) => food.name).join(', ');
    const note = typeof item.note === 'string' ? item.note.trim() : '';
    const estimate = item.estimated === true ? ` · ${ESTIMATE_LABEL}` : '';
    return [{ meal: slot ? MEAL_LABEL[slot] : 'Meal', detail: `${names || note || 'Meal'}${estimate}` }];
  });
}

function sharedCalories(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const items: FoodItem[] = [{
    name: 'Day',
    kcal: typeof row.kcal === 'number' ? row.kcal : 0,
    proteinG: typeof row.proteinG === 'number' ? row.proteinG : 0,
    carbsG: typeof row.carbsG === 'number' ? row.carbsG : 0,
    sugarG: typeof row.sugarG === 'number' ? row.sugarG : 0,
    fibreG: typeof row.fibreG === 'number' ? row.fibreG : 0,
    unsaturatedG: 0,
    saturatedG: 0,
    transG: 0,
    sodiumMg: 0,
    processed: false,
  }];
  const logged = items[0] && (items[0].kcal > 0 || items[0].proteinG > 0 || items[0].carbsG > 0 || items[0].sugarG > 0 || items[0].fibreG > 0);
  return caloriesShareLine(logged ? items : [], row.kcal == null);
}

function sharedQuality(value: unknown): SharedQuality | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const unsaturated = typeof row.unsaturatedG === 'number' ? row.unsaturatedG : 0;
  const other = typeof row.otherG === 'number' ? row.otherG : 0;
  const items: FoodItem[] = [{
    name: 'Day',
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    sugarG: 0,
    fibreG: 0,
    unsaturatedG: unsaturated,
    saturatedG: other,
    transG: 0,
    sodiumMg: 0,
    processed: false,
  }];
  const balance = fatBalance(unsaturated + other > 0 ? items : []);
  return { unsaturated: balance.unsaturated, other: balance.other, line: balance.line };
}

function sharedGoal(value: unknown): SharedGoal | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' && isNutritionGoal(row.id) ? row.id : null;
  if (!id) return null;
  const direction = row.direction === 'down' || row.direction === 'up' || row.direction === 'steady' ? row.direction : 'unknown';
  return {
    label: GOAL_LABEL[id],
    line: goalShareLine({
      goal: id,
      proteinG: typeof row.proteinG === 'number' ? row.proteinG : null,
      proteinTarget: typeof row.proteinTargetG === 'number' ? row.proteinTargetG : null,
      direction,
      hideCalories: row.hideCalories === true,
      blockedLoss: row.bmiLow === true,
    }),
  };
}

export function parseSharedNutrition(value: unknown): SharedNutritionView | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const wagon = raw.wagonOn === true
    ? { note: typeof raw.wagonNote === 'string' ? raw.wagonNote.trim().slice(0, 200) : '' }
    : null;
  const progressBase = typeof raw.progressDays === 'number' ? progressShareLine(raw.progressDays) : null;
  const composition = progressBase && typeof raw.composition === 'string' ? raw.composition.trim() : '';
  return {
    meals: sharedMealRows(raw),
    calories: sharedCalories(raw.calories),
    quality: sharedQuality(raw.quality),
    progress: progressBase ? `${progressBase}${composition ? ` ${composition}` : ''}` : null,
    wagon,
    goal: sharedGoal(raw.goal),
  };
}

export function nutritionHealthQuantities(items: readonly FoodItem[], waterMl: number): Record<string, number> {
  const totals = sumItems(items);
  return {
    kcal: totals.kcal,
    proteinG: totals.proteinG,
    carbsG: totals.carbsG,
    sugarG: totals.sugarG,
    fibreG: totals.fibreG,
    fatTotal: round1(totals.unsaturatedG + totals.saturatedG + totals.transG),
    saturatedG: totals.saturatedG,
    unsaturatedG: totals.unsaturatedG,
    sodiumG: round1(totals.sodiumMg / 1000),
    waterMl: Math.max(0, Math.round(waterMl)),
  };
}
