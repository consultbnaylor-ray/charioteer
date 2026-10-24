import AsyncStorage from '@react-native-async-storage/async-storage';

import { communityPromptSnoozed, withCommunityPromptSnooze } from '@/domain/communityPrompt';

const KEY = 'charioteer.community.prompt.snooze.v1';

export async function communityPromptHidden(userId: string, now = Date.now()): Promise<boolean> {
  try {
    return communityPromptSnoozed(await AsyncStorage.getItem(KEY), userId, now);
  } catch {
    return false;
  }
}

export async function snoozeCommunityPrompt(userId: string, now = Date.now()): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    await AsyncStorage.setItem(KEY, withCommunityPromptSnooze(raw, userId, now));
  } catch {
    // The card still hides for this visit.
  }
}
