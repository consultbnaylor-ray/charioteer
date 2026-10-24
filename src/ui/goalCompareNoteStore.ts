import AsyncStorage from '@react-native-async-storage/async-storage';

import { goalCompareNoteSeenIn, withGoalCompareNoteSeen } from '@/domain/goalCompareNote';

const KEY = 'charioteer.goal.compare.note.v1';

export async function goalCompareNoteSeen(userId: string): Promise<boolean> {
  try {
    return goalCompareNoteSeenIn(await AsyncStorage.getItem(KEY), userId);
  } catch {
    return false;
  }
}

export async function markGoalCompareNoteSeen(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    await AsyncStorage.setItem(KEY, withGoalCompareNoteSeen(raw, userId));
  } catch {
    // The note can show again on a later visit. The comparisons still name the goal.
  }
}
