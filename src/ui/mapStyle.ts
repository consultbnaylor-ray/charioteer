import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadEmphasizedFootpathStyle } from '@/domain/footpathStyle';
import { MAP_STYLE_STORAGE_KEY, parseMapScheme, type MapScheme } from '@/domain/outdoorRoute';

export async function loadMapScheme(): Promise<MapScheme> {
  try {
    return parseMapScheme(await AsyncStorage.getItem(MAP_STYLE_STORAGE_KEY));
  } catch {
    return 'light';
  }
}

export async function saveMapScheme(scheme: MapScheme): Promise<void> {
  try {
    await AsyncStorage.setItem(MAP_STYLE_STORAGE_KEY, scheme);
  } catch {
    // The map still uses the choice for this visit.
  }
}

/** Light until the stored choice loads. Independent of the app theme. */
export function useMapScheme(): [MapScheme, (scheme: MapScheme) => void] {
  const [scheme, setScheme] = useState<MapScheme>('light');
  useEffect(() => {
    let live = true;
    void loadMapScheme().then((value) => {
      if (live) setScheme(value);
    });
    return () => {
      live = false;
    };
  }, []);
  function choose(next: MapScheme) {
    setScheme(next);
    void saveMapScheme(next);
  }
  return [scheme, choose];
}

/** The OpenFreeMap style, then the same style with footpaths emphasized. The URL shows until that edit loads. */
export function useFootpathStyle(scheme: MapScheme, url: string): string | object {
  const [style, setStyle] = useState<string | object>(url);
  useEffect(() => {
    let live = true;
    setStyle(url);
    void loadEmphasizedFootpathStyle(url, scheme).then((next) => {
      if (live && next && typeof next === 'object') setStyle(next);
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [scheme, url]);
  return style;
}
