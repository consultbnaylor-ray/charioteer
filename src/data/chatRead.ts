import AsyncStorage from '@react-native-async-storage/async-storage';

import { chatInstant, mergeReadMarks } from '@/domain/liveChat';

type Marks = Record<string, string>;
type Snapshot = {
  userId: string | null;
  marks: Marks;
  ready: boolean;
  localLoaded: boolean;
  /** True only after a read of the server marks succeeded. A failure must not invent a read line. */
  serverLoaded: boolean;
};

const EMPTY: Snapshot = { userId: null, marks: {}, ready: false, localLoaded: false, serverLoaded: false };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
let loading: Promise<Marks> | null = null;
let loadingFor: string | null = null;
let persistTicket = 0;

function key(userId: string) {
  return `charioteer.chat-read.v1.${userId}`;
}

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function marksFrom(value: unknown): Marks {
  if (!value || typeof value !== 'object') return {};
  const marks: Marks = {};
  for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
    if (typeof at === 'string' && at) marks[id] = at;
  }
  return marks;
}

async function persistMarks(userId: string): Promise<void> {
  persistTicket += 1;
  const ticket = persistTicket;
  if (snapshot.userId !== userId) return;
  const payload = JSON.stringify(snapshot.marks);
  try {
    await AsyncStorage.setItem(key(userId), payload);
  } catch {
    return;
  }
  if (ticket !== persistTicket) await persistMarks(userId);
}

async function readStored(userId: string): Promise<Marks> {
  let parsed: Marks = {};
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    parsed = marksFrom(raw ? JSON.parse(raw) as unknown : {});
  } catch {
    parsed = {};
  }
  const current = snapshot.userId === userId ? snapshot.marks : {};
  const marks = mergeReadMarks(parsed, current);
  publish({
    userId,
    marks,
    ready: snapshot.userId === userId ? snapshot.ready : false,
    localLoaded: true,
    serverLoaded: snapshot.userId === userId ? snapshot.serverLoaded : false,
  });
  return snapshot.marks;
}

export function subscribeChatRead(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChatReadMarks(): Snapshot {
  return snapshot;
}

export async function loadChatRead(userId: string): Promise<Marks> {
  if (snapshot.userId === userId && snapshot.localLoaded) return snapshot.marks;
  if (loading && loadingFor === userId) return loading;
  if (snapshot.userId !== userId) {
    publish({ userId, marks: {}, ready: false, localLoaded: false, serverLoaded: false });
  }
  loadingFor = userId;
  loading = readStored(userId).finally(() => {
    if (loadingFor === userId) loading = null;
  });
  return loading;
}

/**
 * Folds server marks in. A later instant wins, including a mark saved while this read was in flight.
 * Returns local marks that are ahead of the server so the caller can heal them.
 */
export function applyRemoteChatReads(userId: string, remote: Marks, serverLoaded: boolean): Marks {
  const current = snapshot.userId === userId ? snapshot.marks : {};
  const merged = mergeReadMarks(current, serverLoaded ? remote : {});
  publish({ userId, marks: merged, ready: true, localLoaded: true, serverLoaded });
  void persistMarks(userId);
  if (!serverLoaded) return {};
  const ahead: Marks = {};
  for (const [id, at] of Object.entries(current)) {
    const server = remote[id];
    if (!server || chatInstant(at) > chatInstant(server)) ahead[id] = at;
  }
  return ahead;
}

/** Moves the read line forward. An older time does not uncover messages again. */
export async function markChatRead(userId: string, connectionId: string, at: string): Promise<boolean> {
  if (!(snapshot.userId === userId && snapshot.localLoaded)) await loadChatRead(userId);
  const current = snapshot.userId === userId ? snapshot.marks : {};
  const previous = current[connectionId];
  if (previous && chatInstant(previous) >= chatInstant(at)) return false;
  publish({
    userId,
    marks: { ...current, [connectionId]: at },
    ready: snapshot.userId === userId ? snapshot.ready : false,
    localLoaded: true,
    serverLoaded: snapshot.userId === userId ? snapshot.serverLoaded : false,
  });
  await persistMarks(userId);
  return true;
}
