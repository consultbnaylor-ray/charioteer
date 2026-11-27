import AsyncStorage from '@react-native-async-storage/async-storage';

import { RUBBER_TIP_KEY, rubberTipSeenIn } from '@/domain/rubberTip';

/** Whether the rubber tip has been tapped away or the rubber used on this phone. */
export async function rubberTipSeen(): Promise<boolean> {
  try {
    return rubberTipSeenIn(await AsyncStorage.getItem(RUBBER_TIP_KEY));
  } catch {
    // Storage unavailable: treat it as seen so the tip cannot keep coming back.
    return true;
  }
}

export async function markRubberTipSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(RUBBER_TIP_KEY, '1');
  } catch {
    // The tip still hides for this visit.
  }
}
