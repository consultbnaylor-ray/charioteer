import { AppState } from 'react-native';
import {
  queryQuantitySamples,
  queryQuantitySamplesWithAnchor,
  subscribeToChanges,
} from '@kingstinct/react-native-healthkit';

import type { LiveReading } from './liveReading';

/**
 * Anchored heart-rate query plus an observer, both only while the app is in front.
 * Background delivery is not requested. Active energy is a foreground sum for a gym session.
 * Nothing in this file is written to storage or included in an export.
 */
export async function watchLiveReading(
  startedAtMs: number,
  includeEnergy: boolean,
  onUpdate: (reading: LiveReading) => void,
): Promise<() => void> {
  let stopped = false;
  let removeObserver: (() => void) | null = null;
  let anchor: string | undefined;
  let bpm: number | null = null;
  let bpmAtMs: number | null = null;
  let activeKcal: number | null = null;

  function publish() {
    if (stopped) return;
    onUpdate({ bpm, bpmAtMs, activeKcal });
  }

  async function pullHeart() {
    if (stopped || AppState.currentState !== 'active') return;
    try {
      const page = await queryQuantitySamplesWithAnchor('HKQuantityTypeIdentifierHeartRate', {
        limit: 5,
        unit: 'count/min',
        anchor,
      });
      anchor = page.newAnchor;
      let newest = bpmAtMs ?? 0;
      for (const sample of page.samples) {
        const at = new Date(sample.startDate).getTime();
        if (!Number.isFinite(at) || at < newest) continue;
        if (!(sample.quantity > 30) || !(sample.quantity < 230)) continue;
        newest = at;
        bpm = sample.quantity;
        bpmAtMs = at;
      }
    } catch {
      // No source, or Health is off. The row stays empty.
    }
    publish();
  }

  async function pullEnergy() {
    if (!includeEnergy || stopped || AppState.currentState !== 'active') return;
    try {
      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierActiveEnergyBurned', {
        limit: 0,
        unit: 'kcal',
        filter: { date: { startDate: new Date(startedAtMs), endDate: new Date() } },
      });
      const total = samples.reduce((sum, sample) => sum + (Number.isFinite(sample.quantity) ? sample.quantity : 0), 0);
      activeKcal = total > 0 ? total : null;
    } catch {
      activeKcal = null;
    }
    publish();
  }

  function listen() {
    if (stopped || AppState.currentState !== 'active' || removeObserver) return;
    const subscription = subscribeToChanges('HKQuantityTypeIdentifierHeartRate', () => {
      void pullHeart();
      void pullEnergy();
    });
    removeObserver = () => {
      subscription.remove();
    };
  }

  function dropListener() {
    removeObserver?.();
    removeObserver = null;
  }

  const appSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      listen();
      void pullHeart();
      void pullEnergy();
      return;
    }
    dropListener();
  });

  if (AppState.currentState === 'active') {
    listen();
    await pullHeart();
    await pullEnergy();
  } else {
    publish();
  }

  return () => {
    stopped = true;
    dropListener();
    appSub.remove();
  };
}
