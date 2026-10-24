import type { GarminExportPermission } from '../../supabase/functions/_shared/garmin';

export type { GarminExportPermission };
export {
  garminMissingPermissions,
  garminPermissionCheckDue,
  garminPermissionStatus,
} from '../../supabase/functions/_shared/garmin';

/** Banner title when Garmin is connected and summaries are not arriving. */
export const GARMIN_NOT_SENDING = "Garmin isn't sending your data yet";

export const GARMIN_PERMISSIONS_NEED = 'Charioteer needs permission for Activities and Daily Health Stats.';

export const GARMIN_PERMISSIONS_FIX = 'Fix Garmin permissions';

export const GARMIN_PERMISSIONS_ALLOW = 'Turn on every switch, then tap Allow.';

export const GARMIN_PERMISSIONS_SETTINGS = 'Open Garmin Connect settings';

/** Green tick after a repair comes back with both exports. */
export const GARMIN_PERMISSIONS_OK = 'Garmin permissions OK';

/**
 * Garmin Connect web Account Information page. Connected applications are listed there.
 * Garmin Forums, including a verified reply, give this URL as that list:
 * https://forums.garmin.com/sports-fitness/sports-fitness/f/vivoactive-3-3-music/221218/sync-garmin-connect-with-runkeeper
 * No documented app scheme opens that page, so this link stays on the web.
 */
export const GARMIN_CONNECT_SETTINGS_URL = 'https://connect.garmin.com/modern/settings/accountInformation';

const DAY_MS = 24 * 60 * 60 * 1000;

let lastProbeAt = 0;
let overlayNeeds = false;
let overlayMissing: GarminExportPermission[] = [];
let repairPending = false;
let repairRunning = false;
let refreshRefused = false;
let permissionsOk = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeGarminPermission(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function garminPermissionProbeDue(now: number): boolean {
  return now - lastProbeAt >= DAY_MS;
}

export function noteGarminPermissionProbe(now: number): void {
  lastProbeAt = now;
}

export function garminPermissionOverlay(): { needs: boolean; missing: GarminExportPermission[] } {
  return { needs: overlayNeeds, missing: overlayMissing };
}

/** Remember a live permissions read so every open Garmin card updates together. */
export function noteGarminPermissionResult(result: { needsPermissions: boolean; missing: GarminExportPermission[] }): void {
  overlayNeeds = result.needsPermissions;
  overlayMissing = result.missing;
  if (result.needsPermissions) permissionsOk = false;
  notify();
}

export function beginGarminPermissionRepair(): void {
  repairPending = true;
  permissionsOk = false;
  notify();
}

export function cancelGarminPermissionRepair(): void {
  repairPending = false;
  repairRunning = false;
}

export function garminPermissionRepairPending(): boolean {
  return repairPending;
}

export function claimGarminPermissionRepair(): boolean {
  if (!repairPending || repairRunning) return false;
  repairRunning = true;
  repairPending = false;
  return true;
}

export function finishGarminPermissionRepair(): void {
  repairRunning = false;
}

export function noteGarminRefreshRefused(refused: boolean): void {
  refreshRefused = refused;
  if (refused) permissionsOk = false;
  notify();
}

export function garminRefreshWasRefused(): boolean {
  return refreshRefused;
}

export function markGarminPermissionsOk(ok: boolean): void {
  permissionsOk = ok;
  if (ok) refreshRefused = false;
  notify();
}

export function garminPermissionsAreOk(): boolean {
  return permissionsOk;
}

export function clearGarminPermissionSession(): void {
  refreshRefused = false;
  permissionsOk = false;
  repairPending = false;
  overlayNeeds = false;
  overlayMissing = [];
  notify();
}
