/**
 * Finished holds the raw line in memory so the screen can still change the trim.
 * Save writes a separate copy on the phone. Leaving the screen drops this hold.
 * A hold set while the screen is not open, such as Stop on the banner, stays until
 * that screen is opened and then left.
 */

import type { ActivitySummary, SplitMark } from '@/domain/activitySession';
import type { WalkedPoint } from '@/activity/walkedLine';

export type FinishHold = {
  summary: ActivitySummary;
  limit: boolean;
  splits: SplitMark[];
  line: WalkedPoint[];
  savedId: string | null;
};

let hold: FinishHold | null = null;

export function readFinishHold(): FinishHold | null {
  return hold;
}

export function setFinishHold(next: FinishHold): void {
  hold = next;
}

export function noteFinishSaved(summaryId: string, lineId: string): void {
  if (hold && hold.summary.id === summaryId) hold = { ...hold, savedId: lineId };
}

/** The outing screen unmounted. The raw line is not kept for a later opening. */
export function dropFinishOnLeave(): void {
  hold = null;
}
