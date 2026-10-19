import { useEffect, useSyncExternalStore } from 'react';

import { useRepository } from '@/data';
import { applyRemoteChatReads, getChatReadMarks, loadChatRead, subscribeChatRead } from '@/data/chatRead';

/**
 * Saved read line for each chat. A thread with no line stays unread.
 * Opening the chat is what moves the line forward.
 */
export function useChatRead(userId: string | null | undefined): { marks: Record<string, string>; ready: boolean } {
  const repo = useRepository();
  const stored = useSyncExternalStore(subscribeChatRead, getChatReadMarks, getChatReadMarks);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void (async () => {
      await loadChatRead(userId);
      let remote: Record<string, string> = {};
      let serverLoaded = false;
      try {
        remote = await repo.loadChatReads();
        serverLoaded = true;
      } catch (error) {
        console.error(error);
      }
      if (!live) return;
      const ahead = applyRemoteChatReads(userId, remote, serverLoaded);
      await Promise.all(Object.entries(ahead).map(async ([id, at]) => {
        try {
          await repo.saveChatRead(id, at);
        } catch (error) {
          console.error(error);
        }
      }));
    })();
    return () => {
      live = false;
    };
  }, [userId, repo]);

  const ready = Boolean(userId) && stored.userId === userId && stored.ready;
  const marks = ready ? stored.marks : {};
  return { marks, ready };
}
