import AsyncStorage from '@react-native-async-storage/async-storage';

import { healthReadSetKey } from '@/domain/healthVisibility';

const KEY = 'charioteer.health.readSet.v1';

/** The read-type set last passed to requestAuthorization. Null until this build has asked. */
export async function loadHealthReadSet(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function saveHealthReadSet(types: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, healthReadSetKey(types));
  } catch {
    // The next launch asks again. Readings already stored stay put.
  }
}
