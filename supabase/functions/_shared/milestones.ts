import { addMonthsUtc, addYearsUtc } from './time';
import { HOUR_MS } from './sober';

export const MILESTONE_KEYS = ['24h', '7d', '30d', '90d', '6m', '1y'] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export type Milestone = {
  key: MilestoneKey;
  label: string;
  badge: string;
  detail: string;
};

export const MILESTONES: readonly Milestone[] = [
  { key: '24h', label: '24 hours', badge: 'First day', detail: 'A full day with the reins in your hands.' },
  { key: '7d', label: '7 days', badge: 'One week', detail: 'Seven mornings on the other side of it.' },
  { key: '30d', label: '30 days', badge: 'One month', detail: 'A month of choosing yourself.' },
  { key: '90d', label: '90 days', badge: 'Ninety days', detail: 'A season of practice.' },
  { key: '6m', label: '6 months', badge: 'Half year', detail: 'Half a year, counted properly.' },
  { key: '1y', label: '1 year', badge: 'A year', detail: 'A whole turn around the sun.' },
];

export function milestoneReached(key: MilestoneKey, startedAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - startedAt.getTime();
  if (elapsed < 0) return false;
  switch (key) {
    case '24h':
      return elapsed >= 24 * HOUR_MS;
    case '7d':
      return elapsed >= 7 * 24 * HOUR_MS;
    case '30d':
      return elapsed >= 30 * 24 * HOUR_MS;
    case '90d':
      return elapsed >= 90 * 24 * HOUR_MS;
    case '6m':
      return now.getTime() >= addMonthsUtc(startedAt, 6).getTime();
    case '1y':
      return now.getTime() >= addYearsUtc(startedAt, 1).getTime();
    default:
      return false;
  }
}

export function earnedMilestones(startedAt: Date, now: Date): Milestone[] {
  return MILESTONES.filter((milestone) => milestoneReached(milestone.key, startedAt, now));
}
