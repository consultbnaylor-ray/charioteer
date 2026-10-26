import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ACTIVITY_SUMMARIES_KEY,
  parseActivitySummary,
  type ActivitySummary,
} from '@/domain/activitySession';

const CAP = 30;

export async function loadActivitySummaries(): Promise<ActivitySummary[]> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_SUMMARIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseActivitySummary).filter((row): row is ActivitySummary => row != null).slice(0, CAP);
  } catch {
    return [];
  }
}

export async function saveActivitySummary(summary: ActivitySummary): Promise<void> {
  const current = await loadActivitySummaries();
  const next = [summary, ...current.filter((row) => row.id !== summary.id)].slice(0, CAP);
  await AsyncStorage.setItem(ACTIVITY_SUMMARIES_KEY, JSON.stringify(next));
}

export async function deleteActivitySummary(id: string): Promise<void> {
  const current = await loadActivitySummaries();
  await AsyncStorage.setItem(
    ACTIVITY_SUMMARIES_KEY,
    JSON.stringify(current.filter((row) => row.id !== id)),
  );
}
