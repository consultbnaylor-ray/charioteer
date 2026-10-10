import { URGE_TIMER_MS } from '@/domain/urge';

let startedAt: number | null = null;

export function ensureUrge(now = Date.now()): number {
  if (startedAt == null || now >= startedAt + URGE_TIMER_MS) startedAt = now;
  return startedAt;
}

export function restartUrge(now = Date.now()): number {
  startedAt = now;
  return startedAt;
}
