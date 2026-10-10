const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type SoberElapsed = {
  totalMs: number;
  totalHours: number;
  days: number;
  hours: number;
};

export function soberElapsed(startedAt: Date, now: Date): SoberElapsed {
  const totalMs = Math.max(0, now.getTime() - startedAt.getTime());
  const totalHours = Math.floor(totalMs / HOUR_MS);
  return {
    totalMs,
    totalHours,
    days: Math.floor(totalHours / 24),
    hours: totalHours % 24,
  };
}

export function formatSoberElapsed(elapsed: SoberElapsed): string {
  const dayLabel = elapsed.days === 1 ? '1 day' : `${elapsed.days} days`;
  const hourLabel = elapsed.hours === 1 ? '1 hour' : `${elapsed.hours} hours`;
  return `${dayLabel}, ${hourLabel}`;
}

export type RelapseRecord = {
  occurredAt: string;
  previousStartedAt: string;
  daysKept: number;
  note: string;
};

/** A lapse resets the current clock and keeps the previous stretch as history. */
export function planRelapse(previousStartedAt: Date, now: Date, note: string): {
  nextStartedAt: Date;
  record: RelapseRecord;
} {
  const elapsed = soberElapsed(previousStartedAt, now);
  return {
    nextStartedAt: now,
    record: {
      occurredAt: now.toISOString(),
      previousStartedAt: previousStartedAt.toISOString(),
      daysKept: elapsed.days,
      note: note.trim(),
    },
  };
}

export { DAY_MS, HOUR_MS };
