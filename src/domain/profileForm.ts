import { planReasons } from './reasons';
import type { Stage } from './stage';

export type ProfileFormValues = {
  name: string;
  town: string;
  spend: string;
  units: string;
  reasons: string;
  community: boolean;
  health: boolean;
  ai: boolean;
  messages?: boolean;
  stage: Stage;
  soberDay: string;
  plannedQuit: string;
  quitUnsure: boolean;
  unitsGoal: string;
  drinkFreeGoal: string;
};

function sameNumber(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (a === b) return true;
  const x = Number(a);
  const y = Number(b);
  return a !== '' && b !== '' && Number.isFinite(x) && Number.isFinite(y) && x === y;
}

function lines(value: string): string {
  return planReasons(value.split('\n')).join('\n');
}

/** Trimmed lines before case-insensitive duplicates are removed. */
function rawLines(value: string): string {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
}

/** True when Your details differs from what was last saved. */
export function profileDetailsDirty(current: ProfileFormValues, saved: ProfileFormValues): boolean {
  if (current.name.trim() !== saved.name.trim()) return true;
  if (current.town.trim() !== saved.town.trim()) return true;
  if (!sameNumber(current.spend, saved.spend)) return true;
  if (!sameNumber(current.units, saved.units)) return true;
  if (lines(current.reasons) !== lines(saved.reasons)) return true;
  // A repeated line would be stored once. Keep Save available so the next write can replace it.
  if (rawLines(current.reasons) !== lines(current.reasons)) return true;
  if (rawLines(saved.reasons) !== lines(saved.reasons)) return true;
  if (current.community !== saved.community) return true;
  if (current.health !== saved.health) return true;
  if (current.ai !== saved.ai) return true;
  if (current.messages !== undefined && saved.messages !== undefined && current.messages !== saved.messages) return true;
  if (current.stage !== saved.stage) return true;
  if (current.stage === 'stopped' && current.soberDay !== saved.soberDay) return true;
  if (current.stage === 'trying_to_stop') {
    if (current.quitUnsure !== saved.quitUnsure) return true;
    if (!current.quitUnsure && current.plannedQuit !== saved.plannedQuit) return true;
  }
  if (current.stage === 'cutting_down') {
    if (!sameNumber(current.unitsGoal, saved.unitsGoal)) return true;
    if (!sameNumber(current.drinkFreeGoal, saved.drinkFreeGoal)) return true;
  }
  return false;
}
