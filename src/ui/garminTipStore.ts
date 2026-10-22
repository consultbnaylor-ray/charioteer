import AsyncStorage from '@react-native-async-storage/async-storage';

import { garminTipDismissedIn, withGarminTipDismissed } from '@/domain/garminTip';

const KEY = 'charioteer.garmin.tip.v1';

export async function garminTipDismissed(profileId: string): Promise<boolean> {
  try {
    return garminTipDismissedIn(await AsyncStorage.getItem(KEY), profileId);
  } catch {
    return false;
  }
}

export async function markGarminTipDismissed(profileId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    await AsyncStorage.setItem(KEY, withGarminTipDismissed(raw, profileId));
  } catch {
    // The tip can show again on a later visit.
  }
}
