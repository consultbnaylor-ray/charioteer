import AsyncStorage from '@react-native-async-storage/async-storage';

import { messagePromptSeenIn, withMessagePromptSeen } from '@/domain/messagePrompt';

const KEY = 'charioteer.message.notification.asked.v1';

export async function messagePromptSeen(userId: string): Promise<boolean> {
  try {
    return messagePromptSeenIn(await AsyncStorage.getItem(KEY), userId);
  } catch {
    return false;
  }
}

export async function markMessagePromptSeen(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    await AsyncStorage.setItem(KEY, withMessagePromptSeen(raw, userId));
  } catch {
    // The card still hides for this visit.
  }
}
