import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVITY_UPDATES_KEY = 'charioteer.activity-updates';

export type ActivityUpdateChoice = {
  enabled: boolean;
  intervalMin: 3 | 5 | 10;
  spoken: boolean;
};

export const ACTIVITY_UPDATE_FALLBACK: ActivityUpdateChoice = {
  enabled: false,
  intervalMin: 5,
  spoken: false,
};

export function parseActivityUpdates(raw: string | null): ActivityUpdateChoice {
  if (!raw) return { ...ACTIVITY_UPDATE_FALLBACK };
  try {
    const value = JSON.parse(raw) as Partial<ActivityUpdateChoice>;
    const intervalMin = value.intervalMin === 3 || value.intervalMin === 10 ? value.intervalMin : 5;
    return {
      enabled: value.enabled === true,
      intervalMin,
      spoken: value.spoken === true,
    };
  } catch {
    return { ...ACTIVITY_UPDATE_FALLBACK };
  }
}

export async function readActivityUpdates(): Promise<ActivityUpdateChoice> {
  try {
    return parseActivityUpdates(await AsyncStorage.getItem(ACTIVITY_UPDATES_KEY));
  } catch {
    return { ...ACTIVITY_UPDATE_FALLBACK };
  }
}

export async function writeActivityUpdates(choice: ActivityUpdateChoice): Promise<void> {
  const stored = parseActivityUpdates(JSON.stringify(choice));
  await AsyncStorage.setItem(ACTIVITY_UPDATES_KEY, JSON.stringify(stored));
}
