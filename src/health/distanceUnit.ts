import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseDistanceUnit, type DistanceUnit } from '@/domain/workoutRoute';

const KEY = 'charioteer.distanceUnit';

/** Kilometres or miles. Stored on this phone only. */
export async function loadDistanceUnit(): Promise<DistanceUnit> {
  try {
    return parseDistanceUnit(await AsyncStorage.getItem(KEY));
  } catch {
    return 'km';
  }
}

export async function saveDistanceUnit(unit: DistanceUnit): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, unit);
  } catch {
    // The choice still applies for this visit when storage is unavailable.
  }
}
