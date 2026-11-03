export {
  chartScale,
  goalProgressSeries,
  type DatedValue,
  type GoalProgressSeries,
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
