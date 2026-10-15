import { useEffect, useRef, useSyncExternalStore } from 'react';

import { useRepository } from '@/data';
import { applyRemoteChatReads, getChatReadMarks, loadChatRead, markChatRead, subscribeChatRead } from '@/data/chatRead';
import { initialReadThrough } from '@/domain/liveChat';

export type ChatReadThread = { id: string; newestAt: string | null };

/**
 * Read line for each chat. A thread with no saved line uses the newest message
 * already loaded, so old history is not shown as new. The saved line is written
 * once the phone and the server have both been read.
 */
export function useChatRead(userId: string | null | undefined, threads: readonly ChatReadThread[]): { marks: Record<string, string>; ready: boolean } {
  const repo = useRepository();
  const stored = useSyncExternalStore(subscribeChatRead, getChatReadMarks, getChatReadMarks);
  const threadKey = threads.map((thread) => `${thread.id}:${thread.newestAt ?? ''}`).join('|');
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

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

  useEffect(() => {
    if (!userId) return;
    const storedNow = getChatReadMarks();
    if (storedNow.userId !== userId || !storedNow.ready || !storedNow.serverLoaded) return;
    for (const thread of threadsRef.current) {
      if (!thread.newestAt || storedNow.marks[thread.id]) continue;
      const at = thread.newestAt;
      void markChatRead(userId, thread.id, at).then((moved) => {
        if (!moved) return;
        void repo.saveChatRead(thread.id, at).catch((error: unknown) => console.error(error));
      });
    }
  }, [userId, repo, threadKey, stored.ready, stored.serverLoaded, stored.userId]);

  const ready = Boolean(userId) && stored.userId === userId && stored.ready;
  const saved = ready ? stored.marks : stored.userId === userId ? stored.marks : {};
  const marks: Record<string, string> = {};
  for (const thread of threads) {
    const through = initialReadThrough(thread.newestAt, saved[thread.id]);
    if (through) marks[thread.id] = through;
  }
  for (const [id, at] of Object.entries(saved)) {
    if (!marks[id]) marks[id] = at;
  }
  return { marks, ready };
}
