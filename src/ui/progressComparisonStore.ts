import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ComparisonChoice } from '@/domain/progressComparison';

const KEY = 'charioteer.progress.comparison.v1';

export async function loadProgressComparison(userId: string): Promise<ComparisonChoice | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, Partial<ComparisonChoice>>;
    const row = parsed?.[userId];
    if (!row || typeof row.beforeId !== 'string' || typeof row.nowId !== 'string') return null;
    return { beforeId: row.beforeId, nowId: row.nowId };
  } catch {
    return null;
  }
}

export async function saveProgressComparison(userId: string, choice: ComparisonChoice): Promise<void> {
  let current: Record<string, ComparisonChoice> = {};
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, ComparisonChoice>;
      if (parsed && typeof parsed === 'object') current = parsed;
    }
  } catch {
    current = {};
  }
  current[userId] = choice;
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}
