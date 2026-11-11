import AsyncStorage from '@react-native-async-storage/async-storage';

import { londonDay } from '@/domain/healthInsights';
import { garminWatchLinkDismissed, withGarminWatchLinkDismissed } from '@/domain/healthRefresh';

const KEY = 'charioteer.garmin.watch-link.v1';

export async function garminWatchLinkHidden(userId: string, now = new Date()): Promise<boolean> {
  try {
    return garminWatchLinkDismissed(await AsyncStorage.getItem(KEY), userId, londonDay(now));
  } catch {
    return false;
  }
}

export async function hideGarminWatchLink(userId: string, now = new Date()): Promise<void> {
  if (!userId) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    await AsyncStorage.setItem(KEY, withGarminWatchLinkDismissed(raw, userId, londonDay(now)));
  } catch {
    // The note can show again on the next visit.
  }
}
