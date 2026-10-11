import { isoDay, parseIsoDay, startOfLocalDay } from './dates';

export const STAGES = ['stopped', 'trying_to_stop', 'cutting_down', 'exploring'] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  stopped: 'I’ve stopped',
  trying_to_stop: 'Trying to stop',
  cutting_down: 'Trying to cut down',
  exploring: 'Still drinking, just exploring',
};

export const SUDDEN_STOP_WARNING =
  'If you have been drinking heavily every day, stopping suddenly can be dangerous. Speak to a GP, or call NHS 111, before you stop.';

/** Usual-week figures for someone who has stopped, or is trying to stop. */
export const USUAL_WEEK_PAST =
  'Enter what you used to drink when you were drinking the most, to see how much you’ve been saving.';

/** Usual-week figures while someone is cutting down or still drinking. */
export const USUAL_WEEK_NOW = 'Your usual week now';

export function usualWeekPrompt(stage: Stage | null): string {
  return stage === 'stopped' || stage === 'trying_to_stop' ? USUAL_WEEK_PAST : USUAL_WEEK_NOW;
}

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value);
}

/** Existing accounts with a sober date are stopped. Everyone else is exploring until they choose. */
export function stageFromRecord(stage: unknown, sobrietyStartedAt: string | null): Stage {
  if (isStage(stage)) return stage;
  return sobrietyStartedAt ? 'stopped' : 'exploring';
}

export function showsSoberRecord(stage: Stage): boolean {
  return stage === 'stopped';
}

export function daysUntil(day: string, now: Date): number {
  const target = startOfLocalDay(parseIsoDay(day));
  const today = startOfLocalDay(now);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function startOfUkWeek(now: Date): Date {
  const today = startOfLocalDay(now);
  const mondayOffset = (today.getDay() + 6) % 7;
  today.setDate(today.getDate() - mondayOffset);
  return today;
}

export function drinkFreeThisWeek(dates: readonly string[], now: Date): number {
  const start = startOfUkWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const seen = new Set(dates.filter((day) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const date = parseIsoDay(day);
    return date >= start && date < end;
  }));
  return seen.size;
}

export function toggleDrinkFreeDay(dates: readonly string[], day: string): string[] {
  return dates.includes(day) ? dates.filter((item) => item !== day) : [...dates, day].sort();
}

export function validateStageStep(input: {
  stage: Stage | null;
  soberDay: string;
  today: string;
  plannedQuit: string | null;
  quitUnsure: boolean;
  unitsGoal: string;
  drinkFreeGoal: string;
}): string | null {
  if (!input.stage) return 'Choose where you are right now.';
  if (input.stage === 'stopped' && input.soberDay > input.today) return 'Choose today or an earlier day.';
  if (input.stage === 'trying_to_stop' && !input.quitUnsure && input.plannedQuit && input.plannedQuit < input.today) {
    return 'Choose today or a later day, or say you are not sure yet.';
  }
  if (input.stage === 'cutting_down') {
    const units = parseUnitsGoal(input.unitsGoal);
    if (!units.ok) return units.message;
    const days = parseDrinkFreeGoal(input.drinkFreeGoal);
    if (!days.ok) return days.message;
  }
  return null;
}

export function parseUnitsGoal(value: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false, message: 'The units goal needs to be zero or more.' };
  return { ok: true, value: parsed };
}

export function parseDrinkFreeGoal(value: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 7) return { ok: false, message: 'Drink-free days are from 0 to 7.' };
  return { ok: true, value: parsed };
}

export function todayIso(now = new Date()): string {
  return isoDay(now);
}
