import { BODY_FAT_HIGH, BODY_FAT_LOW, WAIST_HEIGHT_HEALTHY, type NutritionSex } from '@/domain/nutrition';
import { MILESTONES, milestoneReached, milestoneReachedOn } from '@/domain/milestones';
import { soberElapsed } from '@/domain/sober';

/** A week of lines to aim for. Not stored on the profile. */
export const GRATITUDE_WEEK_AIM = 7;

export const WAIST_ZONE_CAPTION = 'Healthy range under 0.5';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type BarTone = 'good' | 'watch' | 'info' | 'attention' | 'empty';

export type ChartBar = {
  key: string;
  label: string;
  value: number;
  tone: BarTone;
  /** A quiet mark for a day with nothing logged. Omitted days are a gap. */
  missing?: 'line';
};

/** How a stat or nutrition figure is drawn. */
export type DistanceChart =
  | { kind: 'ring'; centre: string; unit: string; fill: number; status: string }
  | { kind: 'bars'; bars: ChartBar[]; max: number; target: number | null; layout?: 'column' | 'row' }
  | { kind: 'line'; points: number[] }
  | {
    kind: 'range';
    value: number;
    zoneLow: number;
    zoneHigh: number;
    scaleMin: number;
    scaleMax: number;
    status: string;
    zoneCaption: string;
  }
  | { kind: 'none' };

export type MeasureRange = {
  zoneLow: number;
  zoneHigh: number;
  scaleMin: number;
  scaleMax: number;
  within: boolean;
  status: string;
};

function band(sex: NutritionSex | null): { low: number; high: number } {
  if (sex === 'female') return { low: BODY_FAT_LOW.female, high: BODY_FAT_HIGH.female };
  if (sex === 'male') return { low: BODY_FAT_LOW.male, high: BODY_FAT_HIGH.male };
  return { low: BODY_FAT_LOW.unset, high: BODY_FAT_HIGH.unset };
}

/** Body-fat percentage against the screen's band. The band is not a diagnosis. */
export function bodyFatRange(pct: number, sex: NutritionSex | null): MeasureRange {
  const { low, high } = band(sex);
  const within = pct >= low && pct < high;
  return {
    zoneLow: low,
    zoneHigh: high,
    scaleMin: 0,
    scaleMax: Math.max(45, pct + 5, high + 8),
    within,
    status: within ? 'Within healthy range' : pct < low ? 'Under the healthy range' : 'Above the healthy range',
  };
}

export function bodyFatZoneCaption(range: MeasureRange): string {
  return `Healthy range ${range.zoneLow}–${range.zoneHigh}%`;
}

/** Waist divided by height. Under 0.5 is the healthy band on this screen. */
export function waistRange(ratio: number): MeasureRange {
  const scaleMin = Math.min(0.25, Math.max(0, ratio - 0.05));
  const scaleMax = Math.max(0.75, ratio + 0.05);
  const within = ratio < WAIST_HEIGHT_HEALTHY;
  return {
    zoneLow: scaleMin,
    zoneHigh: Math.min(WAIST_HEIGHT_HEALTHY, scaleMax),
    scaleMin,
    scaleMax,
    within,
    status: within ? 'Within healthy range' : 'Above the healthy range',
  };
}

export function soberMilestoneRing(startedAt: Date, now: Date): { centre: string; unit: string; fill: number; status: string } {
  const elapsed = soberElapsed(startedAt, now);
  const centre = String(elapsed.days);
  const unit = elapsed.days === 1 ? 'day' : 'days';
  const next = MILESTONES.find((milestone) => !milestoneReached(milestone.key, startedAt, now));
  if (!next) return { centre, unit, fill: 1, status: 'Still going' };
  const at = milestoneReachedOn(next.key, startedAt);
  const span = Math.max(1, at.getTime() - startedAt.getTime());
  const fill = Math.max(0, Math.min(1, (now.getTime() - startedAt.getTime()) / span));
  if (next.key === '24h') {
    const hoursLeft = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / HOUR_MS));
    return { centre, unit, fill, status: hoursLeft === 1 ? '1 hour to 24 hours' : `${hoursLeft} hours to 24 hours` };
  }
  const daysLeft = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / DAY_MS));
  return { centre, unit, fill, status: daysLeft === 1 ? `1 day to ${next.label}` : `${daysLeft} days to ${next.label}` };
}

export function drinkFreeRing(free: number, goal: number): { centre: string; unit: string; fill: number; status: string } {
  const fill = goal > 0 ? Math.max(0, Math.min(1, free / goal)) : 0;
  const centre = String(free);
  const unit = `of ${goal}`;
  if (goal > 0 && free >= goal) return { centre, unit, fill: 1, status: "This week's aim is met" };
  const left = Math.max(0, goal - free);
  return { centre, unit, fill, status: left === 1 ? '1 day to go' : `${left} days to go` };
}

export function gratitudeWeekRing(count: number): { centre: string; unit: string; fill: number; status: string } {
  const fill = Math.max(0, Math.min(1, count / GRATITUDE_WEEK_AIM));
  const centre = String(count);
  if (count <= 0) return { centre: '0', unit: 'lines', fill: 0, status: 'None this week' };
  if (count >= GRATITUDE_WEEK_AIM) return { centre, unit: 'lines', fill: 1, status: "This week's aim is met" };
  const left = GRATITUDE_WEEK_AIM - count;
  return { centre, unit: 'lines', fill, status: left === 1 ? '1 line to go' : `${left} lines to go` };
}
