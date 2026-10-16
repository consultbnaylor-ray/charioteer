import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import type { FoodLogUpdate, NewHealthSample } from '@/data/types';
import { formatUkCompact, formatUkCompactWhen, formatUkLong, formatUkTime, isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { parseHeightCm } from '@/domain/guidance';
import { randomId } from '@/domain/id';
import {
  APPLE_HEALTH_MEAL_NOTE,
  DUPLICATE_MEAL_PROMPT,
  ESTIMATE_HINT,
  ESTIMATE_LABEL,
  BUILDER_PHASES,
  COMPETITION_NOTE,
  FAT_SCIENCE,
  MIDDLEWEIGHT_LIMIT_KG,
  isTrainingGoal,
  HIDE_CALORIES_LINE,
  LOW_BMI_NOTE,
  MEAL_LABEL,
  MEAL_SLOTS,
  PHASE_LABEL,
  alcoholSavedLine,
  compositionForAssessment,
  compositionTrendLine,
  dayItems,
  fatBalance,
  goalBodyForSuggestion,
  goalDayLine,
  goalMealNote,
  macroDayLine,
  kcalFloor,
  lossBlocked,
  mifflinBmr,
  nutritionPatternLines,
  mealNutrientBars,
  processedLine,
  recentDuplicateMeal,
  sugarCravingNote,
  suggestedTargetsLine,
  suggestGoalTargets,
  sumItems,
  targetLine,
  todayMealRows,
  todayMealTotals,
  todayRing,
  weightPointsFrom,
  weightTrendLine,
  type BuilderPhase,
  type FoodItem,
  type FoodLog,
  type GoalBody,
  type MealSlot,
  type MealSource,
  type NutritionSex,
} from '@/domain/nutrition';
import { healthFigure } from '@/domain/measureFigures';
import { savingsFromTypicalWeek } from '@/domain/savings';
import { soberElapsed } from '@/domain/sober';
import { weightReadingKg } from '@/domain/weightEntry';
import { readAppleHealthBody } from '@/health/sync';
import { writeDayToAppleHealth } from '@/health/writeNutrition';
import { BodyCompositionCard } from '@/ui/BodyComposition';
import { GoalChoices } from '@/ui/GoalChoices';
import { MealEstimateStatus } from '@/ui/MealEstimateStatus';
import { MealBreakdown } from '@/ui/MealNutrientBars';
import { MealEdit } from '@/ui/MealEdit';
import { statsToneColors } from '@/ui/statsPalette';
import { TodayMeals } from '@/ui/TodayMeals';
import { HealthFigureView } from '@/ui/MeasuredFigure';
import { NutritionBoard, WaterMeter, WeightTrendChart } from '@/ui/NutritionCharts';
import { FatShareBar, NutritionShareSummary, NutritionShareSwitch, WagonFlag } from '@/ui/NutritionShare';
import { NutritionSectionShare } from '@/ui/SectionShare';
import { pickMealPhoto } from '@/ui/pickMealPhoto';
import { usePendingPress } from '@/ui/pendingAction';
import { ScrollTarget } from '@/ui/ScrollTarget';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, Choice, ErrorNote, Field, QuietNote, Screen, T, playSavedHaptic, useScreenScroller } from '@/ui/ui';

type DraftItem = {
  name: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  sugarG: string;
  fibreG: string;
  unsaturatedG: string;
  saturatedG: string;
  transG: string;
  sodiumMg: string;
  processed: boolean;
};

type Draft = {
  meal: MealSlot;
  source: MealSource;
  note: string;
  items: DraftItem[];
  estimated: boolean;
  previewUri: string | null;
  photoBase64: string | null;
};

const SAMPLE_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAGQAoADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1qiiioKCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACisnVfFeg6IxTUNUgikVgrRKS8ikjIyq5IGO5GOR61x978ZNPj2fYNJuZ853+fIsWPTGN2e/pRYR6NRXlI8X/ETWkhjsNJFr5uHSeO0Kq64J+9KSuD1z34wfU/sT4l6xK0t3qz2LIoVR9q8sOOeghyM+555Hpw7AerUV5Ufhr4g1X/AJDviMyeV/qfmkuMZ+998rt6DpnP4Uf8Ke/6j3/kp/8AZ0tAPVaK8q/4U9/1Hv8AyU/+zoHwv1jS/wB/oniLy7hvkY4e3+TqfmUsTyBxj+VGgHqtFeUt4d+JGlul1a6297IrY8sXjOACDyVlAUj8+cU5fEnxL0iVorvS2v2kUMpNr5gQc9DDgZPofQdO7sB6pRXmmnfGS3baup6TLHiP5pLaQPufjorYwOv8Rxx1611ukeN/DutbFtdSiSZtg8mf92+5uigHhjnj5Sf1FKwG9RRRQMKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACorm6t7K3a4u54reFMbpJXCquTgZJ46muK134o6faSmy0OBtUvWby0KA+UG5AA7uc44Xgg8NWBa+C/E3i24jvvFOoSwQ8FYmwXwQudqD5Y8gc98jlTRYRsa18XdLtkki0e3lvZhwssg8uLkdefmODgYwM881kLYfEHxc4/tC6l02xl37lP7oBCcMnlr8zcZwH7Drzz3OieGdJ8PxbdPtFSQrh53+aR+mct6HAOBgZ7Vq0XHY4nS/hXodooa/km1CTaQwLGNM54ICnIOOOWPf8Oq07SNO0mLytPsobZSqqxjQAuB03Hqx68nPU1copXAKKKKACiiigAooooAKKKKAILuxs9QiEV7aw3MYbcEmjDgH1we/JrldR+F/h67ixaJNYyBWw0chcEnoWDZyB6AjvXY0UAeYyeHPHXhPP9g6nLeWaI2EQg7Bwx/dPkZJzjbknnpnFaWkfFuFXNr4h0+S0uEfY8kCkqpyQdyE7lxxwNxPPA6V3lUdV0TTNbgEOpWcdwq/dLDDLyCdrDkZwM4PNO4WL2nanY6vaLd6fdRXMLfxRtnBwDgjqDgjg8irVeVXnw81nQbv+0PCepSl1x+6dwkhGV4zwrjIJIOBgAc1o6H8UFt2XTvFVpPZXcSgPP5RwxwTlkxlSRt6Agk54FAj0SimxSxzxJNDIskcihkdDkMDyCD3FOoGFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFc54u8aWPhO3QSJ9pvJeY7ZX2nbnlmODtHXHHJ+hIANTWtasdA0yTUNQl2RJwFHLSN2VR3J/wDrnABNea3d/wCIviXeyW1gGstBWVVcsB2yct3Zuh2g4B25/vU7R/CupeNr5fEfiadkglYGK2UEb4+SAOfkT06k8nvuPpFtbW9nAtvawRwQpnbHEgVRk5OAOOpo2EYvh3wbpPh2KNoYFmvFX57qRcuTzkr/AHByRgdsZz1rfoopDCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKytb8M6T4gi26haK8gXCTp8sidcYb0GScHIz2rVooA8s+zeJvhlcG4tZPt+imRGmGAFYkYwRyUP+0OD8uc/dr0fw74m03xPZNc6e7AxttkhkAEkZ7ZAJ4PYg4/EEC1LFHNE8UqLJG6lXRxkMD1BHcV574j8CXWmXreIfCsrQXELeYLSNeQedxT1H+xjBGQOy09wPTqK5DwZ8QLXxO32K5iW01BVyIw2VmAHJXPQ9Tt5OOcnnHX0CCiiigYUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUVg+MPE8PhbRXusxPdyfLbQuT+8bjJwOcAHJ6dhkEigCDxn4ztfClltULPqEy5ggJ4A/vt6L+pPA7kc74V8FzXlxJ4g8Vp9qvbr5lt51BCAjq69M44C9FHvwsfgXw3NqVw3ivXxJPeTPvtxMBjGBiTH6KMAAAEfwkeg0AFFFFIAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOO8YeB49TUanoqraarC3mAxfu/OOc8kdHzyG9evYiz4H8cf25nSdWH2fWIMqysuzztvUgdmGOV/EcZC9RXF+PPCX9oQHW9KSRNWtdrjyOGmAI/Hco5BHPGOeMNAd9RXJeAPGH/CTaY0N5JENStuJFXgypxiTHTqcHHQ+mQK62gQUUUUDCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAq6nqNvpGmXGoXbbYbeMu3IBOOgGSBkngDuSK8w8P2Fx4/8UzeJdUij/s+B9iWzMXBIX5UAz0GQx7Ek8cnB4o1Cb4geLoPD2lzL9gtWLNcJuZGOBucgcED7q9iT97DcekWVlbadZxWdnCsMEK7URegH9T3J70bCJ6KKKQwooooAKKKKACiiigAoorPvfEGjac0qXmqWkMkK7niaZd4GM/d6k46DHNAGhRXM/8ACxfCn/QV/wDJeX/4mj/hYvhT/oK/+S8v/wATRYDpqKp2mr6ZqEpistRtLmQLuKQzq5A9cA9ORVygAooooAKKKKACiiigAooooAKKKKACiiigAooooA858c6HcaHq0XjHRhHF5EitcxglcuWxuOCMhshWAx1zzkkd54c1638SaLDqVuvl78rJEWDGNx1U4/MdMgg4GasSxRzRPFKiyRupV0cZDA9QR3FeXxvL8NPHPrpGodfv7UjLfjlk/EkHsW4e4j1yimxSxzxJNDIskcihkdDkMDyCD3FOoGFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABXK/ELxMvh7w+8ULst9fK0duVB+UcbmyCMEA8d8kcYzXVV5Fbf8XB+JEl4y+ZpdjjblflaNT8gOV/jYltrc4LDPFCEdT8PvDTeH9DMtwMXd9tkkGCDGuPlQg9xk54HJI5wDXVUUUhhRRRQAUUUUAFFFYPibxdp/hl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x937hbd1PXGPxo/4QT4gf9DQP/A+f/4mvUaKdwPLv+EE+IH/AENA/wDA+f8A+JoHwz8Uan+51vxKHt1+ZR5stx8/QfK20DgnnP8AOvUaKLgeaW3wZt0uFa71uWWEZ3JFbiNjxxhizAc+xrZsvhV4Xtd/nRXN7uxjz5yNn02bevvnpXZUUrgUNO0LSdI2nT9NtrZ1j8vzI4gHK8cFup6Dqeav0UUDCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9k=';

function blankItem(): DraftItem {
  return {
    name: '',
    kcal: '',
    proteinG: '',
    carbsG: '',
    sugarG: '',
    fibreG: '',
    unsaturatedG: '',
    saturatedG: '',
    transG: '',
    sodiumMg: '',
    processed: false,
  };
}

function draftFrom(item: FoodItem): DraftItem {
  return {
    name: item.name,
    kcal: String(item.kcal),
    proteinG: String(item.proteinG),
    carbsG: String(item.carbsG),
    sugarG: String(item.sugarG),
    fibreG: String(item.fibreG),
    unsaturatedG: String(item.unsaturatedG),
    saturatedG: String(item.saturatedG),
    transG: String(item.transG),
    sodiumMg: String(item.sodiumMg),
    processed: item.processed,
  };
}

function numberFrom(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function readAge(value: string): number | null | 'bad' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const age = Math.round(Number(trimmed));
  if (!Number.isFinite(age) || age < 18 || age > 100) return 'bad';
  return age;
}

function readProtein(value: string): number | null | 'bad' {
  return readGrams(value, 1, 700);
}

function readGrams(value: string, min: number, max: number): number | null | 'bad' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const grams = Math.round(Number(trimmed));
  if (!Number.isFinite(grams) || grams < min || grams > max) return 'bad';
  return grams;
}

function readWeightClass(value: string): number | null | 'bad' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const kg = Math.round(Number(trimmed) * 10) / 10;
  if (!Number.isFinite(kg) || kg < 40 || kg > 200) return 'bad';
  return kg;
}

function draftedGrams(value: string, places: number): { value: number; known: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { value: 0, known: false };
  const parsed = numberFrom(trimmed);
  const factor = 10 ** places;
  return { value: Math.round(parsed * factor) / factor, known: true };
}

function itemFromDraft(draft: DraftItem): FoodItem | null {
  const name = draft.name.trim().slice(0, 80);
  if (!name) return null;
  const protein = draftedGrams(draft.proteinG, 1);
  const carbs = draftedGrams(draft.carbsG, 1);
  const sugar = draftedGrams(draft.sugarG, 1);
  const fibre = draftedGrams(draft.fibreG, 1);
  const unsaturated = draftedGrams(draft.unsaturatedG, 1);
  const saturated = draftedGrams(draft.saturatedG, 1);
  const trans = draftedGrams(draft.transG, 1);
  const sodium = draftedGrams(draft.sodiumMg, 0);
  const known = [
    protein.known ? 'proteinG' as const : null,
    carbs.known ? 'carbsG' as const : null,
    sugar.known ? 'sugarG' as const : null,
    fibre.known ? 'fibreG' as const : null,
    unsaturated.known ? 'unsaturatedG' as const : null,
    saturated.known ? 'saturatedG' as const : null,
    trans.known ? 'transG' as const : null,
    sodium.known ? 'sodiumMg' as const : null,
  ].filter((key): key is NonNullable<typeof key> => key != null);
  return {
    name,
    kcal: Math.round(numberFrom(draft.kcal)),
    proteinG: protein.value,
    carbsG: carbs.value,
    sugarG: sugar.value,
    fibreG: fibre.value,
    unsaturatedG: unsaturated.value,
    saturatedG: saturated.value,
    transG: trans.value,
    sodiumMg: sodium.value,
    processed: draft.processed,
    known,
    processedKnown: true,
  };
}

export default function Nutrition() {
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const theme = useAppTheme();
  const { run, isPending } = usePendingPress();
  const profile = snap.profile;
  const today = isoDay(new Date());
  const settings = snap.nutrition;
  const hide = settings.hideCalories;
  const items = dayItems(snap.foodLogs, today);
  const totals = sumItems(items);
  const fats = fatBalance(items);
  const started = profile?.stage === 'stopped' && profile.sobrietyStartedAt ? new Date(profile.sobrietyStartedAt) : null;
  const elapsed = started && !Number.isNaN(started.getTime()) ? soberElapsed(started, new Date()) : null;
  const units = elapsed && profile?.weeklyUnits != null
    ? savingsFromTypicalWeek(profile.weeklySpendGbp ?? 0, profile.weeklyUnits, elapsed.totalMs).units
    : 0;
  const sugar = sugarCravingNote(elapsed ? elapsed.days : null);
  const saved = alcoholSavedLine(units, hide);
  const patterns = nutritionPatternLines(snap.foodLogs, snap.checkIns);
  const water = snap.waterDays.find((day) => day.day === today)?.waterMl ?? 0;
  const earlierLogs = snap.foodLogs
    .filter((log) => log.eatenOn !== today)
    .slice()
    .sort((a, b) => b.eatenOn.localeCompare(a.eatenOn) || b.createdAt.localeCompare(a.createdAt));
  const weights = weightPointsFrom(snap.health);
  const latestWeight = weights.length ? weights[weights.length - 1] : undefined;
  const blocked = settings.goal
    ? lossBlocked({
      goal: settings.goal,
      weightKg: latestWeight?.kg ?? null,
      heightCm: profile?.heightCm ?? null,
      phase: settings.goalPhase,
    })
    : false;
  const macroLine = macroDayLine({
    carbsG: totals.carbsG,
    carbTarget: settings.carbTarget,
    fatG: totals.unsaturatedG + totals.saturatedG + totals.transG,
    fatTarget: settings.fatTarget,
  });
  const compositionTrend = compositionTrendLine(snap.bodyComposition, settings.goal);
  const dayLine = settings.goal
    ? goalDayLine({
      goal: settings.goal,
      hideCalories: hide,
      kcal: totals.kcal,
      kcalTarget: settings.kcalTarget,
      proteinG: totals.proteinG,
      proteinTarget: settings.proteinTarget,
      blockedLoss: blocked,
      carbsG: totals.carbsG,
      carbTarget: settings.carbTarget,
      fatG: totals.unsaturatedG + totals.saturatedG + totals.transG,
      fatTarget: settings.fatTarget,
    })
    : null;

  const [meal, setMeal] = useState<MealSlot>('breakfast');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthNote, setHealthNote] = useState<string | null>(null);
  const [target, setTarget] = useState(settings.kcalTarget == null ? '' : String(settings.kcalTarget));
  const [waterText, setWaterText] = useState(water ? String(water) : '');
  const [goalAge, setGoalAge] = useState(settings.goalAge == null ? '' : String(settings.goalAge));
  const [protein, setProtein] = useState(settings.proteinTarget == null ? '' : String(settings.proteinTarget));
  const [carbs, setCarbs] = useState(settings.carbTarget == null ? '' : String(settings.carbTarget));
  const [fat, setFat] = useState(settings.fatTarget == null ? '' : String(settings.fatTarget));
  const [weightClass, setWeightClass] = useState(settings.weightClassKg == null ? '' : String(settings.weightClassKg));
  const [goalNote, setGoalNote] = useState<string | null>(null);
  const [choiceNote, setChoiceNote] = useState<string | null>(null);
  const [goalWeight, setGoalWeight] = useState('');
  const [goalHeight, setGoalHeight] = useState('');
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [targetsSavedAt, setTargetsSavedAt] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAnchor, setEditAnchor] = useState<'summary' | 'list'>('list');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [mealSavedAt, setMealSavedAt] = useState<number | null>(null);
  const [duplicateAsk, setDuplicateAsk] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [estimateReady, setEstimateReady] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateAttempt, setEstimateAttempt] = useState<'text' | 'camera' | 'library' | 'sample'>('text');
  const [estimateFlash, setEstimateFlash] = useState(false);
  const [pinEstimate, setPinEstimate] = useState(0);
  const savedRowRef = useRef<View>(null);
  const confirmRef = useRef<View>(null);
  const scroller = useScreenScroller();

  useEffect(() => {
    if (targetsSavedAt == null) return;
    const timer = setTimeout(() => setTargetsSavedAt(null), 2500);
    return () => clearTimeout(timer);
  }, [targetsSavedAt]);

  useEffect(() => {
    if (mealSavedAt == null) return;
    const timer = setTimeout(() => setMealSavedAt(null), 2500);
    return () => clearTimeout(timer);
  }, [mealSavedAt]);

  useEffect(() => {
    if (!estimateFlash) return undefined;
    const timer = setTimeout(() => setEstimateFlash(false), 1800);
    return () => clearTimeout(timer);
  }, [estimateFlash]);

  useEffect(() => {
    if (!pinEstimate) return undefined;
    let cancelled = false;
    const pin = () => {
      if (cancelled) return;
      if (Platform.OS === 'web') {
        if (typeof document === 'undefined') return;
        document.getElementById('meal-estimate-confirm')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      const row = confirmRef.current;
      const inner = scroller?.current.innerRef.current;
      const scroll = scroller?.current.scrollRef.current;
      if (!row || !inner || !scroll) return;
      row.measureLayout(
        inner as never,
        (_x, y) => {
          scroll.scrollTo({ y: Math.max(0, y - 8), animated: true });
        },
        () => {},
      );
    };
    const frame = requestAnimationFrame(() => {
      pin();
      requestAnimationFrame(pin);
    });
    const later = setTimeout(pin, 400);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(later);
    };
  }, [pinEstimate, scroller]);

  useEffect(() => {
    if (!revealId) return undefined;
    let cancelled = false;
    const pin = () => {
      if (cancelled) return;
      if (Platform.OS === 'web') {
        if (typeof document === 'undefined') return;
        const node = document.getElementById('saved-meal-row');
        node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      const row = savedRowRef.current;
      const inner = scroller?.current.innerRef.current;
      const scroll = scroller?.current.scrollRef.current;
      if (!row || !inner || !scroll) return;
      row.measureLayout(
        inner as never,
        (_x, y, _width, height) => {
          const viewHeight = scroller?.current.height ?? 0;
          const top = Math.max(0, y - Math.max(8, (viewHeight - height) / 2));
          scroll.scrollTo({ y: top, animated: true });
        },
        () => {},
      );
    };
    const frame = requestAnimationFrame(() => {
      pin();
      requestAnimationFrame(pin);
    });
    const later = setTimeout(pin, 400);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(later);
    };
  }, [revealId, scroller]);

  function floorFor(age: number | null, sex: NutritionSex | null): number | null {
    const weight = latestWeight?.kg ?? null;
    const height = profile?.heightCm ?? null;
    if (weight == null || height == null || age == null) return null;
    const bmr = mifflinBmr({ weightKg: weight, heightCm: height, age, sex });
    if (bmr == null) return null;
    return kcalFloor(bmr, sex);
  }

  function choosePhase(phase: BuilderPhase) {
    setChoiceNote(null);
    const next = settings.goalPhase === phase ? null : phase;
    void repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, goalPhase: next }).catch((err: unknown) => {
      setChoiceNote(shownError(err, 'Could not save that phase.'));
    });
  }

  function chooseSex(sex: NutritionSex | null) {
    setChoiceNote(null);
    void repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, goalSex: sex }).catch((err: unknown) => {
      setChoiceNote(shownError(err, 'Could not save that.'));
    });
  }

  function keepSuggestedMeasures(body: GoalBody, healthDay: string | null) {
    const jobs: Promise<void>[] = [];
    const sameBoxedWeight = latestWeight != null
      && body.weightKg === latestWeight.kg
      && healthDay === latestWeight.day;
    if (
      body.weightKg != null
      && profile?.consentHealth
      && (body.weightFrom === 'typed' || (body.weightFrom === 'health' && !sameBoxedWeight))
    ) {
      const sample: NewHealthSample = {
        kind: 'weight_kg',
        unit: 'kg',
        value: body.weightKg,
        recordedOn: body.weightFrom === 'health' && healthDay ? healthDay : today,
        source: body.weightFrom === 'health' ? 'healthkit' : 'manual',
      };
      jobs.push(repo.saveHealth([sample]));
    }
    if (
      body.heightCm != null
      && (body.heightFrom === 'typed' || body.heightFrom === 'health')
      && body.heightCm !== (profile?.heightCm ?? null)
    ) {
      jobs.push(repo.updateProfile({ heightCm: body.heightCm }));
    }
    if (!jobs.length) return;
    void Promise.all(jobs).catch(() => undefined);
  }

  function suggest() {
    run('suggest', async () => {
      setSuggestNote(null);
      setError(null);
      if (!settings.goal) {
        setSuggestNote('Choose a goal first.');
        return;
      }
      const age = readAge(goalAge);
      if (age === 'bad') {
        setSuggestNote('Age sits between 18 and 100. Leave it blank if you would rather not say.');
        return;
      }
      const typedWeight = weightReadingKg({ unit: 'kg', kilograms: goalWeight, stones: '', pounds: '' });
      if (!typedWeight.ok) {
        setSuggestNote(typedWeight.error);
        return;
      }
      const typedHeight = parseHeightCm(goalHeight);
      if (!typedHeight.ok) {
        setSuggestNote(typedHeight.error);
        return;
      }

      let healthWeight: { kg: number; day: string } | null = null;
      let healthHeightCm: number | null = null;
      let healthDay: string | null = null;
      if (Platform.OS === 'ios' && profile?.consentHealth) {
        const read = await readAppleHealthBody();
        if (read.ok) {
          healthHeightCm = read.body.heightCm;
          if (read.body.weightKg != null && read.body.weightDay) {
            healthWeight = { kg: read.body.weightKg, day: read.body.weightDay };
            healthDay = read.body.weightDay;
          }
        }
      }

      const body = goalBodyForSuggestion({
        box: latestWeight ? { kg: latestWeight.kg, day: latestWeight.day } : null,
        healthWeight,
        profileHeightCm: profile?.heightCm ?? null,
        healthHeightCm,
        typedWeightKg: typedWeight.kg,
        typedHeightCm: typedHeight.value,
      });
      const klass = readWeightClass(weightClass);
      if (klass === 'bad') {
        setSuggestNote('A weight class sits between 40 and 200 kg, or leave it blank.');
        return;
      }
      const figures = compositionForAssessment(snap.bodyComposition);
      const result = suggestGoalTargets({
        goal: settings.goal,
        weightKg: body.weightKg,
        heightCm: body.heightCm,
        age,
        sex: settings.goalSex,
        activeEnergyKcal: settings.activityEnergyKcal,
        build: settings.build,
        bodyFatPct: figures.bodyFatPct,
        waistCm: figures.waistCm,
        phase: settings.goal === 'body_builder' ? settings.goalPhase : null,
        weightClassKg: settings.goal === 'elite_middle_boxer' ? klass : null,
      });
      if (!result.ok) {
        setGoalNote(null);
        setSuggestNote(result.message);
        return;
      }
      setProtein(String(result.suggestion.proteinG));
      setCarbs(String(result.suggestion.carbG));
      setFat(String(result.suggestion.fatG));
      if (!hide) setTarget(String(result.suggestion.kcal));
      setGoalNote(result.suggestion.note);
      setSuggestNote(suggestedTargetsLine({
        kcal: result.suggestion.kcal,
        proteinG: result.suggestion.proteinG,
        carbG: result.suggestion.carbG,
        fatG: result.suggestion.fatG,
        hideCalories: hide,
      }));
      playSavedHaptic();
      keepSuggestedMeasures(body, healthDay);
    });
  }

  function openDraft(next: Draft) {
    setDuplicateAsk(false);
    setDraft({ ...next, meal });
    setError(null);
  }

  function showEstimate(next: Draft) {
    setEstimateError(null);
    setEstimateReady(true);
    setEstimateFlash(true);
    openDraft(next);
    setPinEstimate((value) => value + 1);
  }

  function failEstimate(message: string) {
    setEstimateReady(false);
    setEstimateError(message);
  }

  function retryEstimate() {
    if (estimateAttempt === 'camera' || estimateAttempt === 'library') readPhoto(estimateAttempt);
    else if (estimateAttempt === 'sample') samplePhoto();
    else readText();
  }

  function readText() {
    setEstimateAttempt('text');
    if (text.trim().length < 2) {
      failEstimate('Add a little more detail, or enter the meal yourself.');
      return;
    }
    run('estimate', async () => {
      setEstimateError(null);
      setEstimateReady(false);
      setError(null);
      try {
        const estimate = await repo.estimateMeal({ text });
        if (!estimate.items.length) {
          failEstimate('Add a little more detail, or enter the meal yourself.');
          return;
        }
        showEstimate({
          meal,
          source: 'text',
          note: text.trim().slice(0, 500),
          items: estimate.items.map(draftFrom),
          estimated: true,
          previewUri: null,
          photoBase64: null,
        });
      } catch (err) {
        failEstimate(shownError(err, 'Could not read that meal. You can still type it in yourself.'));
      }
    });
  }

  function readPhoto(source: 'camera' | 'library') {
    const hadEstimate = draft?.estimated === true;
    setEstimateAttempt(source);
    run('photo', async () => {
      setEstimateError(null);
      setEstimateReady(false);
      setError(null);
      try {
        const photo = await pickMealPhoto(source);
        if (!photo) {
          if (hadEstimate) setEstimateReady(true);
          return;
        }
        const estimate = await repo.estimateMeal({ imageBase64: photo.base64, text });
        if (!estimate.items.length) {
          failEstimate('Could not read that photo. You can still type the meal in yourself.');
          return;
        }
        showEstimate({
          meal,
          source: 'photo',
          note: text.trim().slice(0, 500),
          items: estimate.items.map(draftFrom),
          estimated: true,
          previewUri: photo.previewUri,
          photoBase64: photo.base64,
        });
      } catch (err) {
        failEstimate(shownError(err, 'Could not read that photo. You can still type the meal in yourself.'));
      }
    });
  }

  function samplePhoto() {
    setEstimateAttempt('sample');
    run('sample', async () => {
      setEstimateError(null);
      setEstimateReady(false);
      setError(null);
      try {
        const estimate = await repo.estimateMeal({ imageBase64: SAMPLE_JPEG });
        if (!estimate.items.length) {
          failEstimate('Could not read that photo. You can still type the meal in yourself.');
          return;
        }
        showEstimate({
          meal,
          source: 'photo',
          note: 'Sample plate',
          items: estimate.items.map(draftFrom),
          estimated: true,
          previewUri: `data:image/jpeg;base64,${SAMPLE_JPEG}`,
          photoBase64: SAMPLE_JPEG,
        });
      } catch (err) {
        failEstimate(shownError(err, 'Could not read that photo. You can still type the meal in yourself.'));
      }
    });
  }

  function saveMeal(force: boolean) {
    if (!draft) return;
    const foods = draft.items.map(itemFromDraft).filter((item): item is FoodItem => item != null);
    if (!foods.length) {
      setError('Add at least one food.');
      return;
    }
    const ownerId = profile?.id ?? '';
    if (!force && recentDuplicateMeal(snap.foodLogs, ownerId, { meal: draft.meal, note: draft.note, items: foods }, Date.now())) {
      setDuplicateAsk(true);
      return;
    }
    setDuplicateAsk(false);
    const id = randomId();
    run('save', async () => {
      setError(null);
      setHealthNote(null);
      try {
        await repo.saveFoodLog({
          id,
          eatenOn: today,
          meal: draft.meal,
          source: draft.source,
          note: draft.note,
          items: foods,
          estimated: draft.estimated,
          photoBase64: draft.photoBase64,
        });
        setDraft(null);
        setEstimateReady(false);
        setEstimateFlash(false);
        setText('');
        setMealSavedAt(Date.now());
        setRevealId(id);
        playSavedHaptic();
        if (Platform.OS === 'ios' && profile?.consentHealth) {
          const written = await writeDayToAppleHealth(foods, 0);
          setHealthNote(written.ok ? 'Saved to Apple Health.' : written.message);
        }
      } catch (err) {
        setError(shownError(err, 'Could not save that meal.'));
      }
    });
  }

  function saveEdited(id: string, patch: FoodLogUpdate) {
    run('meal-save', async () => {
      setError(null);
      try {
        await repo.updateFoodLog(id, patch);
        setMealSavedAt(Date.now());
        playSavedHaptic();
        // The earlier HealthKit sample has no stored id, so it is left as it is.
        if (profile?.consentHealth) setHealthNote(APPLE_HEALTH_MEAL_NOTE);
      } catch (err) {
        setError(shownError(err, 'Could not save that meal.'));
      }
    });
  }

  function estimateEdited(text: string): Promise<FoodItem[]> {
    return new Promise((resolve, reject) => {
      run('meal-estimate', async () => {
        try {
          const estimate = await repo.estimateMeal({ text });
          resolve(estimate.items);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  function removeLog(id: string) {
    run(`remove:${id}`, async () => {
      setError(null);
      try {
        await repo.deleteFoodLog(id);
        setConfirmId(null);
        if (editingId === id) setEditingId(null);
        if (profile?.consentHealth) setHealthNote(APPLE_HEALTH_MEAL_NOTE);
      } catch (err) {
        setError(shownError(err, 'Could not remove that meal.'));
      }
    });
  }

  function mealActions(log: FoodLog, where: 'summary' | 'list') {
    const active = editAnchor === where;
    const health = Boolean(profile?.consentHealth);
    return (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {where === 'list' ? (
            <Button
              label="Edit"
              tone="quiet"
              accessibilityLabel={`Edit ${log.meal}`}
              onPress={() => {
                setEditAnchor('list');
                setConfirmId(null);
                setMealSavedAt(null);
                setEditingId((current) => (current === log.id && editAnchor === 'list' ? null : log.id));
              }}
            />
          ) : null}
          <Button
            label="Delete"
            tone="quiet"
            accessibilityLabel={`Delete ${log.meal}`}
            onPress={() => {
              setEditAnchor(where);
              setEditingId(null);
              setMealSavedAt(null);
              setConfirmId(log.id);
            }}
          />
        </View>
        {active && confirmId === log.id ? (
          <View style={{ gap: 8 }}>
            <T>Delete this meal?</T>
            {health ? <T variant="muted">{APPLE_HEALTH_MEAL_NOTE}</T> : null}
            <Button label="Delete this meal" tone="quiet" pending={isPending(`remove:${log.id}`)} pendingLabel="Deleting..." onPress={() => removeLog(log.id)} />
            <Button label="Keep it" tone="quiet" disabled={isPending(`remove:${log.id}`)} onPress={() => setConfirmId(null)} />
          </View>
        ) : null}
        {active && editingId === log.id ? (
          <MealEdit
            log={log}
            hideCalories={hide}
            saved={mealSavedAt != null}
            saving={isPending('meal-save')}
            estimating={isPending('meal-estimate')}
            showHealthNote={health}
            onSave={(patch) => saveEdited(log.id, patch)}
            onEstimate={estimateEdited}
            onCancel={() => { if (!isPending('meal-save')) setEditingId(null); }}
            onError={setError}
          />
        ) : null}
      </View>
    );
  }

  function renderLog(log: FoodLog, showDate: boolean) {
    const names = log.items.map((item) => item.name).join(', ');
    const kcal = hide ? '' : ` · ${sumItems(log.items).kcal} kcal`;
    const estimate = log.estimated ? ` · ${ESTIMATE_LABEL}` : '';
    const when = log.eatenAt ? ` · ${formatUkTime(log.eatenAt)}` : '';
    const dateBit = showDate ? `${formatUkCompact(log.eatenOn)} · ` : '';
    const portionBit = log.portion && log.portion !== 1 ? ` · portion ${log.portion}` : '';
    return (
      <View key={log.id} style={{ gap: 6 }}>
        {log.previewUrl ? (
          <Image source={{ uri: log.previewUrl }} style={{ width: 96, height: 96, borderRadius: 10 }} contentFit="cover" accessibilityLabel="Saved meal photo" />
        ) : null}
        <T>{`${dateBit}${MEAL_LABEL[log.meal]}${when}: ${names || log.note || 'Meal'}${portionBit}${kcal}${estimate}`}</T>
        <MealBreakdown bars={mealNutrientBars(log.items)} startOpen={false} />
        {mealActions(log, 'list')}
      </View>
    );
  }

  function kcalFromField(): number | null | 'bad' {
    const trimmed = target.trim();
    if (!trimmed) return null;
    const kcal = Math.round(Number(trimmed));
    if (!Number.isFinite(kcal) || kcal < 800 || kcal > 6000) return 'bad';
    return kcal;
  }

  function refuseLowKcal(kcal: number | null, age: number | null, sex: NutritionSex | null): string | null {
    const floor = floorFor(age, sex);
    if (kcal == null || floor == null || kcal >= floor) return null;
    return `That sits under ${floor.toLocaleString('en-GB')} kcal, which is the floor for this screen. A higher target can be saved.`;
  }

  function saveTarget() {
    run('target', async () => {
      setError(null);
      const kcal = kcalFromField();
      if (kcal === 'bad') {
        setError('A target sits between 800 and 6,000 kcal, or leave it blank.');
        return;
      }
      const current = repo.getSnapshot().nutrition;
      const low = refuseLowKcal(kcal, current.goalAge, current.goalSex);
      if (low) {
        setError(low);
        return;
      }
      try {
        await repo.setNutritionSettings({ ...current, kcalTarget: kcal });
      } catch (err) {
        setError(shownError(err, 'Could not save that target.'));
      }
    });
  }

  function saveTargets() {
    run('targets', async () => {
      setError(null);
      const age = readAge(goalAge);
      if (age === 'bad') {
        setError('Age sits between 18 and 100. Leave it blank if you would rather not say.');
        return;
      }
      const proteinG = readProtein(protein);
      if (proteinG === 'bad') {
        setError('Protein sits between 1 and 700 g, or leave it blank.');
        return;
      }
      const carbG = readGrams(carbs, 1, 1000);
      if (carbG === 'bad') {
        setError('Carbohydrate sits between 1 and 1,000 g, or leave it blank.');
        return;
      }
      const fatG = readGrams(fat, 1, 400);
      if (fatG === 'bad') {
        setError('Fat sits between 1 and 400 g, or leave it blank.');
        return;
      }
      const klass = readWeightClass(weightClass);
      if (klass === 'bad') {
        setError('A weight class sits between 40 and 200 kg, or leave it blank.');
        return;
      }
      const current = repo.getSnapshot().nutrition;
      let kcal = current.kcalTarget;
      if (!hide) {
        const next = kcalFromField();
        if (next === 'bad') {
          setError('A target sits between 800 and 6,000 kcal, or leave it blank.');
          return;
        }
        const low = refuseLowKcal(next, age, current.goalSex);
        if (low) {
          setError(low);
          return;
        }
        kcal = next;
      }
      try {
        await repo.setNutritionSettings({
          ...current,
          goalAge: age,
          proteinTarget: proteinG,
          carbTarget: carbG,
          fatTarget: fatG,
          weightClassKg: current.goal === 'elite_middle_boxer' ? klass : current.weightClassKg,
          kcalTarget: kcal,
        });
        setTargetsSavedAt(Date.now());
        playSavedHaptic();
      } catch (err) {
        setError(shownError(err, 'Could not save those targets.'));
      }
    });
  }

  function saveWater() {
    run('water', async () => {
      setError(null);
      const ml = Math.round(Number(waterText.trim() || '0'));
      if (!Number.isFinite(ml) || ml < 0 || ml > 8000) {
        setError('Water sits between 0 and 8,000 ml.');
        return;
      }
      const previous = repo.getSnapshot().waterDays.find((day) => day.day === today)?.waterMl ?? 0;
      try {
        await repo.setWater(today, ml);
        const added = ml - previous;
        if (Platform.OS === 'ios' && profile?.consentHealth && added > 0) {
          const written = await writeDayToAppleHealth([], added);
          setHealthNote(written.ok ? 'Saved to Apple Health.' : written.message);
        }
      } catch (err) {
        setError(shownError(err, 'Could not save water.'));
      }
    });
  }

  function setHide(value: boolean) {
    setChoiceNote(null);
    void repo.setNutritionSettings({ ...repo.getSnapshot().nutrition, hideCalories: value }).catch((err: unknown) => {
      setChoiceNote(shownError(err, 'Could not update that setting.'));
    });
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setDuplicateAsk(false);
    setDraft((current) => {
      if (!current) return current;
      const itemsNext = current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
      return { ...current, items: itemsNext };
    });
  }

  const ownerId = profile?.id ?? '';
  const mealRows = todayMealRows(snap.foodLogs, today, ownerId);
  const mealTotals = todayMealTotals(snap.foodLogs, today, ownerId);
  const calorieRing = !hide && settings.kcalTarget != null && mealRows.length > 0
    ? todayRing({
      hideCalories: false,
      kcal: mealTotals.kcal,
      kcalTarget: settings.kcalTarget,
      proteinG: mealTotals.proteinG,
      proteinTarget: settings.proteinTarget,
      logged: true,
    })
    : null;
  const summaryLog = editAnchor === 'summary'
    ? snap.foodLogs.find((log) => log.id === editingId || log.id === confirmId) ?? null
    : null;

  const photoNote = draft?.source === 'photo'
    ? goalMealNote({
      goal: settings.goal,
      items: draft.items.map(itemFromDraft).filter((item): item is FoodItem => item != null),
      hideCalories: hide,
      blockedLoss: blocked,
    })
    : null;

  return (
    <Screen
      eyebrow="Tools"
      title="Nutrition"
      intro={`${formatUkLong(today)}. Estimates stay labelled, and nothing is saved until you confirm it.`}
    >
      <NutritionSectionShare />
      <Card>
        <T variant="label">Log a meal</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MEAL_SLOTS.map((slot) => (
            <Choice key={slot} label={MEAL_LABEL[slot]} selected={meal === slot} onPress={() => setMeal(slot)} />
          ))}
        </View>
        <Field label="Describe the meal" value={text} onChangeText={setText} placeholder="2 eggs on toast" />
        <Button label="Estimate from text" pending={isPending('estimate')} pendingLabel="Estimating..." onPress={readText} />
        <Button label="Take a photo" tone="quiet" pending={isPending('photo')} pendingLabel="Estimating..." onPress={() => readPhoto('camera')} />
        <Button label="Choose a photo" tone="quiet" pending={isPending('photo')} pendingLabel="Estimating..." onPress={() => readPhoto('library')} />
        {snap.mode === 'demo' ? (
          <Button label="Use a sample photo" tone="quiet" pending={isPending('sample')} pendingLabel="Estimating..." onPress={samplePhoto} />
        ) : null}
        <Button
          label="Enter it myself"
          tone="quiet"
          onPress={() => {
            setEstimateReady(false);
            setEstimateFlash(false);
            setEstimateError(null);
            openDraft({
              meal,
              source: 'manual',
              note: text.trim().slice(0, 500),
              items: [blankItem()],
              estimated: false,
              previewUri: null,
              photoBase64: null,
            });
          }}
        />
        <MealEstimateStatus
          waiting={isPending('estimate') || isPending('photo') || isPending('sample')}
          ready={estimateReady && draft?.estimated === true}
          error={estimateError}
          onRetry={retryEstimate}
        />
      </Card>
      {draft ? (
        <View ref={confirmRef} nativeID="meal-estimate-confirm" collapsable={false}>
        <Card style={estimateFlash ? { borderColor: statsToneColors(theme.scheme).good.ink, borderWidth: 2 } : undefined}>
          <T variant="label">{draft.source === 'photo' ? 'Confirm this photo' : 'Confirm this meal'}</T>
          {draft.estimated ? <T>{ESTIMATE_LABEL}</T> : null}
          {photoNote ? <T>{photoNote}</T> : null}
          <T>{ESTIMATE_HINT}</T>
          {draft.previewUri ? (
            <Image
              source={{ uri: draft.previewUri }}
              style={{ width: '100%', height: 180, borderRadius: 12 }}
              contentFit="cover"
              accessibilityLabel="Meal photo"
            />
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MEAL_SLOTS.map((slot) => (
              <Choice key={slot} label={MEAL_LABEL[slot]} selected={draft.meal === slot} onPress={() => { setDuplicateAsk(false); setDraft({ ...draft, meal: slot }); }} />
            ))}
          </View>
          {draft.items.map((item, index) => (
            <View key={index} style={{ gap: 8 }}>
              <Field label="Food" value={item.name} onChangeText={(name) => updateItem(index, { name })} />
              {hide ? null : <Field label="kcal" value={item.kcal} onChangeText={(kcal) => updateItem(index, { kcal })} keyboardType="decimal-pad" />}
              <Field label="Protein (g)" value={item.proteinG} onChangeText={(proteinG) => updateItem(index, { proteinG })} keyboardType="decimal-pad" />
              <Field label="Carbohydrate (g)" value={item.carbsG} onChangeText={(carbsG) => updateItem(index, { carbsG })} keyboardType="decimal-pad" />
              <Field label="Sugar (g)" value={item.sugarG} onChangeText={(sugarG) => updateItem(index, { sugarG })} keyboardType="decimal-pad" />
              <Field label="Fibre (g)" value={item.fibreG} onChangeText={(fibreG) => updateItem(index, { fibreG })} keyboardType="decimal-pad" />
              <Field label="Unsaturated fat (g)" value={item.unsaturatedG} onChangeText={(unsaturatedG) => updateItem(index, { unsaturatedG })} keyboardType="decimal-pad" />
              <Field label="Saturated fat (g)" value={item.saturatedG} onChangeText={(saturatedG) => updateItem(index, { saturatedG })} keyboardType="decimal-pad" />
              <Field label="Trans fat (g)" value={item.transG} onChangeText={(transG) => updateItem(index, { transG })} keyboardType="decimal-pad" />
              <Field label="Sodium (mg)" value={item.sodiumMg} onChangeText={(sodiumMg) => updateItem(index, { sodiumMg })} keyboardType="decimal-pad" />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <T style={{ flex: 1 }}>Highly processed</T>
                <Switch
                  accessibilityLabel={`Highly processed, ${item.name || 'food'}`}
                  value={item.processed}
                  onValueChange={(processed) => updateItem(index, { processed })}
                  trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
                  thumbColor={theme.colors.surface}
                />
              </View>
            </View>
          ))}
          <Button label="Add another food" tone="quiet" onPress={() => { setDuplicateAsk(false); setDraft({ ...draft, items: [...draft.items, blankItem()] }); }} />
          {duplicateAsk ? <T>{DUPLICATE_MEAL_PROMPT}</T> : null}
          {duplicateAsk ? (
            <Button label="Add anyway" tone="quiet" pending={isPending('save')} pendingLabel="Saving..." onPress={() => saveMeal(true)} />
          ) : (
            <Button label="Save meal" pending={isPending('save')} pendingLabel="Saving..." onPress={() => saveMeal(false)} />
          )}
          <Button label="Cancel" tone="quiet" disabled={isPending('save')} onPress={() => { setDuplicateAsk(false); setDraft(null); setEstimateReady(false); setEstimateFlash(false); }} />
        </Card>
        </View>
      ) : null}
      <Card>
        <T variant="label">Logged today</T>
        {mealSavedAt != null ? <T>Saved ✓</T> : null}
        <TodayMeals
          rows={mealRows}
          totals={mealTotals}
          hideCalories={hide}
          ring={calorieRing}
          activeId={summaryLog?.id ?? null}
          highlightId={revealId}
          rowRef={savedRowRef}
          onOpen={(id) => {
            setEditAnchor('summary');
            setConfirmId(null);
            setMealSavedAt(null);
            setEditingId((current) => (current === id && editAnchor === 'summary' ? null : id));
          }}
          activeTools={summaryLog ? mealActions(summaryLog, 'summary') : null}
        />
        {earlierLogs.length ? <T variant="label">Earlier</T> : null}
        {earlierLogs.map((log) => renderLog(log, true))}
        <NutritionShareSwitch
          label="Share today's meals"
          item="Today's meals"
          on={settings.shareFoodDiary}
          apply={(current, selected) => ({ ...current, shareFoodDiary: selected })}
        />
      </Card>
      <ScrollTarget id="body">
      <BodyCompositionCard />
      </ScrollTarget>
      <ScrollTarget id="goal">
      <Card>
        <GoalChoices
          framed={false}
          detail="Pick one. A suggestion uses your weight, height, age, and sex if you add them. You can change the numbers."
        />
        {settings.goal === 'body_builder' ? (
          <>
            <T variant="muted">Choose a surplus or a cut. A suggestion uses a lean bulk until you pick a cut.</T>
            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
              {BUILDER_PHASES.map((id) => (
                <Choice key={id} label={PHASE_LABEL[id]} selected={settings.goalPhase === id} onPress={() => choosePhase(id)} />
              ))}
            </ScrollView>
          </>
        ) : null}
        {settings.goal === 'elite_heavy_boxer' ? (
          <T variant="muted">This goal keeps size and power. The suggestion adds a little food. It will not plan a cut.</T>
        ) : null}
        {settings.goal === 'elite_middle_boxer' ? (
          <>
            <T>{COMPETITION_NOTE}</T>
            <T variant="muted">{`Leave this blank and the suggestion uses ${MIDDLEWEIGHT_LIMIT_KG} kg, the middleweight limit on this screen. Type your own class if it is different. The change stays small.`}</T>
            <Field label="Middleweight limit (kg)" value={weightClass} onChangeText={setWeightClass} keyboardType="decimal-pad" placeholder={String(MIDDLEWEIGHT_LIMIT_KG)} />
          </>
        ) : null}
        {settings.goal && isTrainingGoal(settings.goal) && (profile?.stage === 'stopped' || profile?.stage === 'trying_to_stop') ? (
          <T variant="muted">Recovery stays alcohol-free: food, water, sleep, and a soft drink if you want one.</T>
        ) : null}
        <Field label="Age" value={goalAge} onChangeText={setGoalAge} keyboardType="number-pad" placeholder="Optional" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Choice label="Woman" selected={settings.goalSex === 'female'} onPress={() => chooseSex('female')} />
          <Choice label="Man" selected={settings.goalSex === 'male'} onPress={() => chooseSex('male')} />
          <Choice label="Not set" selected={settings.goalSex == null} onPress={() => chooseSex(null)} />
        </View>
        <QuietNote>{choiceNote}</QuietNote>
        {latestWeight == null ? (
          <Field label="Weight (kg)" value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" placeholder="74.2" />
        ) : null}
        {profile?.heightCm == null ? (
          <Field label="Height (cm)" value={goalHeight} onChangeText={setGoalHeight} keyboardType="decimal-pad" placeholder="178" />
        ) : null}
        {latestWeight == null || profile?.heightCm == null ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Health Stats" onPress={() => router.push('/health' as never)}>
            <T variant="muted">Or add them on Health Stats</T>
          </Pressable>
        ) : null}
        <Button label="Suggest targets" tone="quiet" pending={isPending('suggest')} pendingLabel="Suggesting..." onPress={suggest} />
        {suggestNote ? <T>{suggestNote}</T> : null}
        {blocked ? <T>{LOW_BMI_NOTE}</T> : null}
        {goalNote && !blocked ? <T variant="muted">{goalNote}</T> : null}
        {hide ? null : (
          <Field label="Daily kcal" value={target} onChangeText={setTarget} keyboardType="number-pad" placeholder="Leave blank for none" />
        )}
        <Field label="Daily protein (g)" value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="Leave blank for none" />
        <Field label="Daily carbohydrate (g)" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" placeholder="Leave blank for none" />
        <Field label="Daily fat (g)" value={fat} onChangeText={setFat} keyboardType="number-pad" placeholder="Leave blank for none" />
        <Button
          label={targetsSavedAt != null && !isPending('targets') ? 'Saved ✓' : 'Save targets'}
          pending={isPending('targets')}
          pendingLabel="Saving..."
          onPress={saveTargets}
        />
        {settings.goal ? <T variant="muted">{weightTrendLine(weights, settings.goal)}</T> : null}
        {compositionTrend ? <T variant="muted">{compositionTrend}</T> : null}
        {settings.updatedAt ? <T>{`Last updated ${formatUkCompactWhen(settings.updatedAt)}`}</T> : null}
        <NutritionShareSwitch
          label="Share the goal and progress"
          item="The goal and progress"
          on={settings.shareGoal}
          apply={(current, selected) => ({ ...current, shareGoal: selected })}
        />
      </Card>
      </ScrollTarget>
      <ScrollTarget id="today">
      <Card>
        <T variant="label">Today</T>
        {hide ? <T>{HIDE_CALORIES_LINE}</T> : <T>{`${totals.kcal.toLocaleString('en-GB')} kcal`}</T>}
        {!hide && settings.kcalTarget != null ? <T variant="muted">{`Target ${settings.kcalTarget.toLocaleString('en-GB')} kcal`}</T> : null}
        {!hide ? <T>{targetLine(totals.kcal, settings.kcalTarget, false)}</T> : null}
        <T>{`Protein ${totals.proteinG} g · carbohydrate ${totals.carbsG} g · sugar ${totals.sugarG} g`}</T>
        <T>{`Fibre ${totals.fibreG} g · sodium ${totals.sodiumMg.toLocaleString('en-GB')} mg`}</T>
        <T variant="label">Fats</T>
        <FatShareBar unsaturated={fats.unsaturated} other={fats.other} />
        <T variant="muted">{`Unsaturated ${fats.unsaturated} g · saturated and trans ${fats.other} g`}</T>
        <T>{fats.line}</T>
        <T variant="muted">{FAT_SCIENCE}</T>
        {processedLine(items) ? <T>{processedLine(items)}</T> : null}
        {patterns.map((line) => <T key={line}>{line}</T>)}
        {sugar ? <T>{sugar}</T> : null}
        {saved ? <T>{saved}</T> : null}
        {dayLine ? <T>{dayLine}</T> : macroLine ? <T>{macroLine}</T> : null}
        <T variant="muted">{`Water ${water.toLocaleString('en-GB')} ml`}</T>
        <NutritionShareSwitch
          label="Share daily calories and macros"
          item="Daily calories and macros"
          on={settings.shareCalories}
          apply={(current, selected) => ({ ...current, shareCalories: selected })}
        />
      </Card>
      </ScrollTarget>
      <NutritionBoard
        logs={snap.foodLogs}
        today={today}
        hideCalories={hide}
        kcalTarget={settings.kcalTarget}
        proteinTarget={settings.proteinTarget}
        checkIns={snap.checkIns}
        qualitySwitch={(
          <NutritionShareSwitch
            label="Share food quality"
            item="Food quality"
            on={settings.shareQuality}
            apply={(current, selected) => ({ ...current, shareQuality: selected })}
          />
        )}
        progressSwitch={(
          <NutritionShareSwitch
            label="Share progress and streaks"
            item="Progress and streaks"
            on={settings.shareProgress}
            apply={(current, selected) => ({ ...current, shareProgress: selected })}
          />
        )}
      />
      <ScrollTarget id="water">
      <Card>
        <T variant="label">Water</T>
        <WaterMeter ml={water} />
        <Field label="Water today (ml)" value={waterText} onChangeText={setWaterText} keyboardType="number-pad" placeholder="350" />
        <Button label="Save water" pending={isPending('water')} pendingLabel="Saving..." onPress={saveWater} />
      </Card>
      </ScrollTarget>
      <ScrollTarget id="weight">
      <Card>
        <T variant="label">Weight</T>
        <HealthFigureView
          figure={healthFigure(
            'weight_kg',
            weights.map((point) => ({ day: point.day, value: point.kg })),
            today,
            { classKg: settings.goal === 'elite_middle_boxer' ? settings.weightClassKg : null },
          )}
        />
        {weights.length === 0 ? <T variant="muted">Add a weight on Health Stats and it will show here.</T> : (
          <>
            {weights.map((point) => (
              <T key={point.day}>{`${formatUkLong(point.day)} · ${point.kg} kg`}</T>
            ))}
            <WeightTrendChart points={weights} goal={settings.goal} />
          </>
        )}
      </Card>
      </ScrollTarget>
      <ScrollTarget id="calories">
      <Card>
        <T variant="label">Calories</T>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <T style={{ flex: 1 }}>Hide calories</T>
          <Switch
            accessibilityLabel="Hide calories"
            value={hide}
            onValueChange={setHide}
            trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
            thumbColor={theme.colors.surface}
          />
        </View>
        <T variant="muted">{HIDE_CALORIES_LINE}</T>
        <QuietNote>{choiceNote}</QuietNote>
        {hide ? null : (
          <>
            <Field label="Optional kcal target" value={target} onChangeText={setTarget} keyboardType="number-pad" placeholder="Leave blank for none" />
            <Button label="Save target" pending={isPending('target')} pendingLabel="Saving..." onPress={saveTarget} />
          </>
        )}
      </Card>
      </ScrollTarget>
      <WagonFlag />
      <NutritionShareSummary />
      {healthNote ? <T variant="muted">{healthNote}</T> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Screen>
  );
}
