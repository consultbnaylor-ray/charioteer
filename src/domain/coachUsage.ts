export type CoachUsage = { used: number; limit: number };

let usage: CoachUsage | null = null;
const listeners = new Set<() => void>();

export function rememberCoachUsage(next: CoachUsage | null) {
  usage = next;
  for (const listener of listeners) listener();
}

export function subscribeCoachUsage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function coachUsageSnapshot(): CoachUsage | null {
  return usage;
}
