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
  'If CONTEXT includes a nutrition summary, you may mention it. Estimates are estimates. Do not shame anyone about calories, weight, or a day over a target. If calories are hidden, do not mention kcal. If CONTEXT says they have fallen off the wagon, treat that as a safety moment: be gentle, do not shame, and mention the Samaritans on 116 123 and Drinkline on 0300 123 1110. Sugar cravings in early recovery are common; you may say so only when CONTEXT includes that note.';

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
  meal: MealSlot;
  source: MealSource;
  note: string;
  items: FoodItem[];
  estimated: boolean;
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
  wagonOn: boolean;
  wagonNote: string;
  wagonVisible: boolean;
};

export type NutritionDay = { day: string; waterMl: number };

export function defaultNutritionSettings(): NutritionSettings {
  return {
    kcalTarget: null,
    hideCalories: false,
    shareFoodDiary: false,
    shareCalories: false,
    shareQuality: false,
    shareProgress: false,
    wagonOn: false,
    wagonNote: '',
    wagonVisible: false,
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

export function nutritionContextLines(input: {
  logs: readonly FoodLog[];
  settings: NutritionSettings;
  waterMl: number;
  checkIns: readonly { createdAt: string; mood: number; sleepHours: number }[];
  soberDays: number | null;
  unitsAvoided: number;
  today: string;
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

export type SharedQuality = { unsaturated: number; other: number; line: string };

export type SharedNutritionView = {
  /** Null when that switch is off. An empty list means meals are shared and today is blank. */
  meals: { meal: string; detail: string }[] | null;
  calories: string | null;
  quality: SharedQuality | null;
  progress: string | null;
  wagon: { note: string } | null;
};

/** What another member may see. Each field is null unless its own switch is on. */
export function presentSharedNutrition(
  settings: NutritionSettings,
  logs: readonly FoodLog[],
  today: string,
): SharedNutritionView {
  const items = dayItems(logs, today);
  const balance = fatBalance(items);
  return {
    meals: settings.shareFoodDiary ? publicMealLines(logs, today) : null,
    calories: settings.shareCalories ? caloriesShareLine(items, settings.hideCalories) : null,
    quality: settings.shareQuality
      ? { unsaturated: balance.unsaturated, other: balance.other, line: balance.line }
      : null,
    progress: settings.shareProgress ? progressShareLine(mealStreakDays(logs, today)) : null,
    wagon: settings.wagonOn && settings.wagonVisible ? { note: settings.wagonNote.trim().slice(0, 200) } : null,
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

export function parseSharedNutrition(value: unknown): SharedNutritionView | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const wagon = raw.wagonOn === true
    ? { note: typeof raw.wagonNote === 'string' ? raw.wagonNote.trim().slice(0, 200) : '' }
    : null;
  return {
    meals: sharedMealRows(raw),
    calories: sharedCalories(raw.calories),
    quality: sharedQuality(raw.quality),
    progress: typeof raw.progressDays === 'number' ? progressShareLine(raw.progressDays) : null,
    wagon,
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
