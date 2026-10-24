import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Top padding for a screen that draws under the status bar.
 * Expo Router already provides the safe-area context. A second provider
 * inside the app was reporting a zero top inset, which put the onboarding
 * step label under the status bar. The status-bar height covers that case
 * when the inset has not arrived yet.
 */
export function topSafeInset(inset: number): number {
  if (Platform.OS === 'web') return inset;
  return Math.max(inset, Constants.statusBarHeight ?? 0);
}
