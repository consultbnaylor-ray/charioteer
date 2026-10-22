import { URGE_TIMER_MS } from '@/domain/urge';

let startedAt: number | null = null;

/** The stored start, if a ten-minute run is in progress. Null until the person taps start. */
export function urgeStartedAt(): number | null {
  return startedAt;
}

export function ensureUrge(now = Date.now()): number {
  if (startedAt == null || now >= startedAt + URGE_TIMER_MS) startedAt = now;
  return startedAt;
}

export function restartUrge(now = Date.now()): number {
  startedAt = now;
  return startedAt;
}

/** Drop a countdown when the chat closes, so the next visit does not resume it. */
export function clearUrge(): void {
  startedAt = null;
}
