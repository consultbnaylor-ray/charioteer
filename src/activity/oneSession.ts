export type LiveClaim = 'outing' | 'gym';

let current: LiveClaim | null = null;

export function currentLive(): LiveClaim | null {
  return current;
}

export function claimLive(kind: LiveClaim): { ok: true } | { ok: false; busy: LiveClaim } {
  if (current && current !== kind) return { ok: false, busy: current };
  current = kind;
  return { ok: true };
}

export function releaseLive(kind: LiveClaim): void {
  if (current === kind) current = null;
}

export function resetLiveClaim(): void {
  current = null;
}
