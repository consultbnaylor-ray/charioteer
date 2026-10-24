import { emptyAppleDailyActivity, type AppleDailyActivity } from '@/domain/dailyActivity';

export type { AppleDailyActivity };

export { emptyAppleDailyActivity };

/** Web and Android have no HealthKit. The iPhone build uses dailyActivity.ios.ts. */
export async function listDailyActivity(): Promise<AppleDailyActivity> {
  return emptyAppleDailyActivity();
}
