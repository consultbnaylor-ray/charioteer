import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import {
  readPreferPaths,
  subscribePreferPaths,
  writePreferPaths,
  type DayStore,
} from '@/domain/routeAdjust';

const phoneStore: DayStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

/** The path preference, remembered on this phone and shared by every route screen. */
export function usePreferPaths(): [boolean, (next: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void readPreferPaths(phoneStore).then((value) => {
      if (live) setOn(value);
    }).catch(() => undefined);
    return subscribePreferPaths((value) => {
      if (live) setOn(value);
    });
  }, []);
  function choose(next: boolean) {
    setOn(next);
    void writePreferPaths(phoneStore, next).catch(() => undefined);
  }
  return [on, choose];
}
