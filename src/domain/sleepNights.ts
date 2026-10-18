/**
 * One night of Apple Health sleep, attributed to the morning it ended.
 * Watch stages are preferred. A night recorded only as time in bed is kept.
 * Awake time is left out, and a session that crosses midnight is not split.
 */

export type SleepSpan = {
  value: number;
  startMs: number;
  endMs: number;
};

const IN_BED = 0;
const ASLEEP_UNSPECIFIED = 1;
const AWAKE = 2;
const ASLEEP_CORE = 3;
const ASLEEP_DEEP = 4;
const ASLEEP_REM = 5;
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

function isStage(value: number): boolean {
  return value === ASLEEP_CORE || value === ASLEEP_DEEP || value === ASLEEP_REM;
}

function hoursOf(spans: readonly SleepSpan[]): number {
  return spans.reduce((sum, span) => sum + Math.max(0, span.endMs - span.startMs) / 3_600_000, 0);
}

/**
 * Hours asleep by the calendar day the session ended.
 * `dayOf` receives the session end in milliseconds.
 */
export function sleepHoursByWakeDay(
  spans: readonly SleepSpan[],
  dayOf: (endMs: number) => string,
): Map<string, number> {
  const usable = spans
    .filter((span) => Number.isFinite(span.value) && span.endMs > span.startMs && span.value !== AWAKE)
    .filter((span) => span.value === IN_BED || span.value === ASLEEP_UNSPECIFIED || isStage(span.value))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);

  const sessions: SleepSpan[][] = [];
  for (const span of usable) {
    const current = sessions[sessions.length - 1];
    const previousEnd = current?.reduce((max, item) => Math.max(max, item.endMs), 0) ?? 0;
    if (!current || span.startMs - previousEnd > SESSION_GAP_MS) sessions.push([span]);
    else current.push(span);
  }

  const days = new Map<string, number>();
  for (const session of sessions) {
    const stages = session.filter((span) => isStage(span.value));
    const unspecified = session.filter((span) => span.value === ASLEEP_UNSPECIFIED);
    const inBed = session.filter((span) => span.value === IN_BED);
    const chosen = stages.length > 0 ? stages : unspecified.length > 0 ? unspecified : inBed;
    const hours = hoursOf(chosen);
    if (hours <= 0) continue;
    const end = chosen.reduce((max, span) => Math.max(max, span.endMs), 0);
    const day = dayOf(end);
    days.set(day, (days.get(day) ?? 0) + hours);
  }
  return days;
}
