import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'charioteer.health.syncedAt';

export async function loadLastSynced(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    if (!value || Number.isNaN(new Date(value).getTime())) return null;
    return value;
  } catch {
    return null;
  }
}

export async function saveLastSynced(iso: string): Promise<void> {
  await AsyncStorage.setItem(KEY, iso);
}
