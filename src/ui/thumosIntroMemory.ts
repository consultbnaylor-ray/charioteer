import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'charioteer.thumos.intro.seen.v1';

export function introSeenIn(raw: string | null, userId: string): boolean {
  if (!raw || !userId) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed?.[userId] === true;
  } catch {
    return false;
  }
}

export function withIntroSeen(raw: string | null, userId: string): string {
  let parsed: Record<string, boolean> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw) as Record<string, boolean>;
      if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value;
    } catch {
      parsed = {};
    }
  }
  parsed[userId] = true;
  return JSON.stringify(parsed);
}

export async function thumosIntroSeen(userId: string): Promise<boolean> {
  try {
    return introSeenIn(await AsyncStorage.getItem(KEY), userId);
  } catch {
    return false;
  }
}

export async function markThumosIntroSeen(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    await AsyncStorage.setItem(KEY, withIntroSeen(raw, userId));
  } catch {
    // The card still collapses for this visit. A later launch may open it once more.
  }
}
