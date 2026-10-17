import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseHealthStatPeriod, type HealthStatPeriod } from '@/domain/healthStatTiles';

const KEY = 'charioteer.health.statPeriod';

/** The last Day / 7 days / 30 days choice, or 7 days when nothing valid is stored. */
export async function loadHealthStatPeriod(): Promise<HealthStatPeriod> {
  try {
    return parseHealthStatPeriod(await AsyncStorage.getItem(KEY));
  } catch {
    return '7';
  }
}

export async function saveHealthStatPeriod(period: HealthStatPeriod): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, period);
  } catch {
    // The choice still applies for this visit when storage is unavailable.
  }
}
