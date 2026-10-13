import AsyncStorage from '@react-native-async-storage/async-storage';

type Marks = Record<string, string>;
type Snapshot = { userId: string | null; marks: Marks };

const EMPTY: Snapshot = { userId: null, marks: {} };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();

function key(userId: string) {
  return `charioteer.chat-read.v1.${userId}`;
}

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeChatRead(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChatReadMarks(): Snapshot {
  return snapshot;
}

export async function loadChatRead(userId: string): Promise<Marks> {
  if (snapshot.userId === userId) return snapshot.marks;
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    const marks = parsed && typeof parsed === 'object' ? parsed as Marks : {};
    publish({ userId, marks });
    return marks;
  } catch {
    publish({ userId, marks: {} });
    return {};
  }
}

/** Moves the read line forward. An older time does not uncover messages again. */
export async function markChatRead(userId: string, connectionId: string, at: string): Promise<void> {
  const current = snapshot.userId === userId ? snapshot.marks : await loadChatRead(userId);
  const previous = current[connectionId];
  if (previous && previous >= at) return;
  const marks = { ...current, [connectionId]: at };
  publish({ userId, marks });
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(marks));
  } catch {
    return undefined;
  }
}
