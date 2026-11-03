import { fuelTradeOffLine, type FitnessGoal } from './fitnessGoal.ts';
import { kcalFloor, mifflinBmr, type NutritionSex } from './nutrition.ts';
import {
  addIsoDays,
  formatIsoDay,
  isoDaysBetween,
  roundKg,
  safeWeeklyChangeKg,
  targetDirection,
} from './targetWeight.ts';

/** A deficit faster than this is not what the card recommends. */
export const MAX_DEFICIT_KCAL = 1000;

/** A date that needs more than this is called unrealistic. */
export const UNREALISTIC_WEEKLY_KG = 1;

const KCAL_PER_KG = 7700;
const KCAL_PER_MODERATE_MIN = 8;
const MODERATE_ACTIVITY = 1.55;

export const DAILY_TARGETS_CAVEAT =
  'Not medical advice. Not a diagnosis. This is a pace estimate from your own figures. The lowest intake suggested here is 1,500 kcal for men and 1,200 kcal for women.';

export const WEIGH_IN_ADVICE =
  'Weigh in once a week, on the same morning, after the toilet and before eating.';

export type DailyTargetPoint = { day: string; kg: number };

export type DailyTargets = {
  headline: string;
  intake: string;
  activity: string;
  weigh: string;
  pace: string | null;
  caveat: string;
  targetKcal: number;
  /** How far the suggested intake sits under estimated burn. Zero when the suggestion is not a deficit. */
  deficitKcal: number;
  /** One sentence for the analysis. App-derived. */
  analysisLine: string;
  /** Set when a weight loss and a harder fitness aim would otherwise fight. */
  fuelNote: string | null;
  path: DailyTargetPoint[];
  unrealistic: boolean;
};

function weightWords(kg: number): string {
  const pounds = kg / 0.45359237;
  let stones = Math.floor(pounds / 14);
  let leftover = Math.round((pounds - stones * 14) * 10) / 10;
  if (leftover >= 14) {
    stones += 1;
    leftover = 0;
  }
  const poundText = Number.isInteger(leftover) ? String(leftover) : leftover.toFixed(1);
  return `${roundKg(kg)} kg (${stones} st ${poundText} lb)`;
}

function pathBetween(startDay: string, startKg: number, endDay: string, endKg: number): DailyTargetPoint[] {
  const span = Math.max(1, isoDaysBetween(startDay, endDay));
  const steps = Math.min(8, span);
  const points: DailyTargetPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const day = addIsoDays(startDay, Math.round((span * index) / steps));
    const kg = startKg + ((endKg - startKg) * index) / steps;
    const last = points[points.length - 1];
    if (last?.day === day) continue;
    points.push({ day, kg: roundKg(kg) });
  }
  return points;
}

/**
 * The intake and activity that match a saved target weight and date.
 * The deficit stays at or under 1,000 kcal, and the intake stays at or above the sex floor.
 */
export function buildDailyTargets(input: {
  currentKg: number;
  targetKg: number;
  targetOn: string;
  today: string;
  heightCm: number | null;
  age: number | null;
  sex: NutritionSex | null;
  activeEnergyKcal: number | null;
  startKg: number | null;
  startDay: string | null;
  fitnessGoal?: FitnessGoal | null;
  competitionCut?: boolean;
}): DailyTargets | null {
  if (!(input.currentKg > 0) || !(input.targetKg >= 30) || !/^\d{4}-\d{2}-\d{2}$/.test(input.targetOn)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today) || input.targetOn <= input.today) return null;
  const bmr = input.heightCm != null && input.age != null
    ? mifflinBmr({ weightKg: input.currentKg, heightCm: input.heightCm, age: input.age, sex: input.sex })
    : null;
  if (bmr == null) return null;
  const active = input.activeEnergyKcal;
  const usedActive = active != null && active >= 0 && active <= 2500;
  const tdee = usedActive ? bmr + Math.round(active) : Math.round(bmr * MODERATE_ACTIVITY);
  const floor = kcalFloor(bmr, input.sex);
  const days = Math.max(1, isoDaysBetween(input.today, input.targetOn));
  const signedKg = input.targetKg - input.currentKg;
  const direction = targetDirection(input.currentKg, input.targetKg);
  const weekly = Math.abs(signedKg) / (days / 7);
  const rawChange = Math.abs(signedKg) * KCAL_PER_KG / days;
  const cut = input.competitionCut === true && direction === 'lose';
  const unrealistic = !cut && direction !== 'hold' && (weekly > UNREALISTIC_WEEKLY_KG || rawChange > MAX_DEFICIT_KCAL);
  const applied = direction === 'hold' ? 0 : Math.min(cut ? rawChange : MAX_DEFICIT_KCAL, Math.round(rawChange));
  let targetKcal = direction === 'gain' ? tdee + applied : direction === 'lose' ? tdee - applied : tdee;
  const floored = targetKcal < floor;
  if (floored) targetKcal = floor;
  targetKcal = Math.round(targetKcal);
  const deficitKcal = direction === 'lose' ? Math.max(0, tdee - targetKcal) : 0;
  const minutes = applied > 0 ? Math.max(10, Math.round(applied / KCAL_PER_MODERATE_MIN)) : 0;
  const when = formatIsoDay(input.targetOn);
  const headline = `To reach ${weightWords(input.targetKg)} by ${when} you should:`;
  const intake = direction === 'gain'
    ? `Raise calorie intake by ${applied.toLocaleString('en-GB')} kcal/day (target ${targetKcal.toLocaleString('en-GB')} kcal).`
    : direction === 'lose'
      ? `Drop calorie intake by ${deficitKcal.toLocaleString('en-GB')} kcal/day (target ${targetKcal.toLocaleString('en-GB')} kcal).`
      : `Hold about ${targetKcal.toLocaleString('en-GB')} kcal/day.`;
  const activity = applied > 0
    ? `Or add about ${applied.toLocaleString('en-GB')} kcal/day of activity, about ${minutes} min at a moderate pace.`
    : 'Keep the activity you already do.';
  const saferWeeks = safeWeeklyChangeKg(input.currentKg);
  const saferDays = saferWeeks > 0 ? Math.ceil((Math.abs(signedKg) / saferWeeks) * 7) : days;
  const saferOn = addIsoDays(input.today, saferDays);
  const pace = cut
    ? `Competition weight cut: about ${weekly.toFixed(1)} kg a week until ${when}. ${floored ? `That pace would need an intake under ${floor.toLocaleString('en-GB')} kcal, so the suggestion stays at that floor. ` : `Intake stays at or above ${floor.toLocaleString('en-GB')} kcal. `}This app will not suggest fluid restriction, a sauna, a sweat suit, diuretics, or laxatives. Keep protein up. After weigh-in, eat and drink again. Dizziness, fainting, confusion, or a racing heart means stop and get urgent help. See a qualified coach, doctor, or dietitian.`
    : unrealistic
      ? `That date needs about ${weekly.toFixed(1)} kg a week, faster than 1 kg a week. This app will not plan a deficit above 1,000 kcal a day. A safer pace of about ${saferWeeks} kg a week would land around ${formatIsoDay(saferOn)}.`
      : floored
        ? `The date would need an intake under ${floor.toLocaleString('en-GB')} kcal, so the suggestion stays at that floor.`
        : null;
  const burn = usedActive
    ? `Estimated burn is about ${tdee.toLocaleString('en-GB')} kcal, using recent activity.`
    : `Estimated burn is about ${tdee.toLocaleString('en-GB')} kcal, assuming a moderately active day.`;
  const fuelNote = fuelTradeOffLine(direction === 'lose', input.fitnessGoal ?? 'normal');
  const analysisLine = [headline, intake, activity, burn, pace, fuelNote].filter((line): line is string => Boolean(line)).join(' ');
  const startDay = input.startDay && /^\d{4}-\d{2}-\d{2}$/.test(input.startDay) ? input.startDay : input.today;
  const startKg = input.startKg != null && input.startKg > 0 ? input.startKg : input.currentKg;
  return {
    headline,
    intake,
    activity,
    weigh: WEIGH_IN_ADVICE,
    pace,
    caveat: DAILY_TARGETS_CAVEAT,
    targetKcal,
    deficitKcal,
    analysisLine: analysisLine.slice(0, 520),
    fuelNote,
    path: pathBetween(startDay, startKg, input.targetOn, input.targetKg),
    unrealistic: unrealistic || floored,
  };
}
