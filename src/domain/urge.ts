export const URGE_TIMER_MS = 10 * 60 * 1000;

export function urgeRemainingSeconds(startedAtMs: number, nowMs: number, durationMs = URGE_TIMER_MS): number {
  return Math.max(0, Math.ceil((startedAtMs + durationMs - nowMs) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
