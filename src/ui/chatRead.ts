import { useEffect, useSyncExternalStore } from 'react';

import { getChatReadMarks, loadChatRead, subscribeChatRead } from '@/data/chatRead';

/** Last time each chat was on screen for this signed-in person. */
export function useChatRead(userId: string | null | undefined): Record<string, string> {
  const stored = useSyncExternalStore(subscribeChatRead, getChatReadMarks, getChatReadMarks);
  useEffect(() => {
    if (!userId) return;
    void loadChatRead(userId);
  }, [userId]);
  if (!userId || stored.userId !== userId) return {};
  return stored.marks;
}
