import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { TextScale, ThemePreference } from '@/data/types';

const light = {
  bg: '#F3EEE6',
  sunken: '#E7E0D4',
  surface: '#FBF7F1',
  ink: '#1C1712',
  muted: '#5E564C',
  line: '#DDD4C6',
  copper: '#8C3F24',
  copperInk: '#FFF8F4',
  copperSoft: '#F4E4D8',
  sage: '#1F5C45',
  sageSoft: '#E4F1EA',
  gold: '#8A5A12',
  danger: '#8C2F2A',
  dangerSoft: '#F8E6E3',
  shadow: 'rgba(48, 32, 18, 0.08)',
};

const dark = {
  bg: '#12100E',
  sunken: '#0C0B0A',
  surface: '#1C1916',
  ink: '#F6F1EA',
  muted: '#B7AFA3',
  line: '#322C26',
  copper: '#E2A78A',
  copperInk: '#2A150E',
  copperSoft: '#3A2820',
  sage: '#8FCBB3',
  sageSoft: '#173028',
  gold: '#E2C48A',
  danger: '#F0B2AC',
  dangerSoft: '#3A2220',
  shadow: 'rgba(0, 0, 0, 0.35)',
};

export type Palette = typeof light;
export type Scheme = 'light' | 'dark';

const scales: Record<TextScale, number> = { default: 1, large: 1.15, extra: 1.32 };

type ThemeValue = {
  scheme: Scheme;
  colors: Palette;
  scale: number;
  font: { display: string; body: string; bodyStrong: string };
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  preference,
  textScale,
  children,
}: {
  preference: ThemePreference;
  textScale: TextScale;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo<ThemeValue>(
    () => ({
      scheme,
      colors: scheme === 'dark' ? dark : light,
      scale: scales[textScale],
      font: {
        display: 'Fraunces_600SemiBold',
        body: 'SourceSans3_400Regular',
        bodyStrong: 'SourceSans3_600SemiBold',
      },
    }),
    [scheme, textScale],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('Theme missing');
  return value;
}
