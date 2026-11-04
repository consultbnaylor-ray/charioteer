export {
  chartScale,
  chartVo2Readings,
  goalProgressSeries,
  orderReadings,
  pacedVo2Target,
  progressLinePath,
  type DatedValue,
  type GoalProgressSeries,
  type Vo2ChartPoint,
  type Vo2ChartSource,
} from '../../supabase/functions/_shared/goalProgress.ts';

export type GoalProgressPhoto = {
  id: string;
  recordedOn: string;
  storagePath: string;
  createdAt: string;
  previewUrl: string | null;
};

export const GOAL_PROGRESS_BUCKET = 'goal-progress-photos';
export const GOAL_PROGRESS_MAX_BYTES = 2_097_152;

export function goalProgressStoragePath(userId: string, photoId: string): string {
  return `${userId}/${photoId}.jpg`;
}

/** How long a private progress-photo link stays valid. */
export const GOAL_PROGRESS_SIGNED_URL_SECONDS = 3600;

/**
 * Object path inside the bucket. A stored path that also starts with the bucket name
 * is reduced to the object path. Traversal and an empty path are rejected.
 */
export function goalProgressObjectPath(storagePath: string): string | null {
  const trimmed = storagePath.trim().replace(/^\/+/, '');
  const prefix = `${GOAL_PROGRESS_BUCKET}/`;
  const path = trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
  if (!path || path.includes('..') || path.includes('\\') || path.startsWith('/')) return null;
  return path;
}

/** A signable URL shape so an existing refresh can read the bucket and object path. */
export function goalProgressSignStub(storagePath: string): string | null {
  const path = goalProgressObjectPath(storagePath);
  if (!path) return null;
  return `https://storage.local/object/sign/${GOAL_PROGRESS_BUCKET}/${path}`;
}

/** Applies a signed link looked up by the object path, including a path that still names the bucket. */
export function withGoalProgressPreviews<T extends { storagePath: string; previewUrl: string | null }>(
  photos: readonly T[],
  signed: ReadonlyMap<string, string>,
): T[] {
  let changed = false;
  const next = photos.map((photo) => {
    const path = goalProgressObjectPath(photo.storagePath);
    const url = (path ? signed.get(path) : undefined) ?? signed.get(photo.storagePath);
    if (!url || url === photo.previewUrl) return photo;
    changed = true;
    return { ...photo, previewUrl: url };
  });
  return changed ? next : (photos as T[]);
}

export function goalProgressPhotosFromRows(rows: unknown): GoalProgressPhoto[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const recordedOn = typeof record.recorded_on === 'string' ? record.recorded_on.slice(0, 10) : '';
    const storagePath = typeof record.storage_path === 'string' ? record.storage_path : '';
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(recordedOn) || !storagePath || storagePath.includes('..')) return [];
    return [{
      id,
      recordedOn,
      storagePath,
      createdAt: typeof record.created_at === 'string' ? record.created_at : '',
      previewUrl: null,
    }];
  });
}
