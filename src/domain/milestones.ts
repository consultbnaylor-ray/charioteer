import { addMonthsUtc, addYearsUtc } from './time';
import type { MilestoneKey } from '../../supabase/functions/_shared/milestones';

export {
  earnedMilestones,
  MILESTONE_KEYS,
  MILESTONES,
  milestoneReached,
  type Milestone,
  type MilestoneKey,
} from '../../supabase/functions/_shared/milestones';

const DAY_MS = 24 * 60 * 60 * 1000;

export function milestoneReachedOn(key: MilestoneKey, startedAt: Date): Date {
  switch (key) {
    case '24h':
      return new Date(startedAt.getTime() + DAY_MS);
    case '7d':
      return new Date(startedAt.getTime() + 7 * DAY_MS);
    case '30d':
      return new Date(startedAt.getTime() + 30 * DAY_MS);
    case '90d':
      return new Date(startedAt.getTime() + 90 * DAY_MS);
    case '6m':
      return addMonthsUtc(startedAt, 6);
    case '1y':
      return addYearsUtc(startedAt, 1);
    default: {
      const never: never = key;
      return never;
    }
  }
}
