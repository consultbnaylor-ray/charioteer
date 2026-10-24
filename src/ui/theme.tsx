import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { TextScale, ThemePreference } from '@/data/types';
import { statsToneColors } from '@/ui/statsPalette';

/**
 * Monochrome system, plus one accent. Near-black and off-white, grey for hierarchy.
 * The accent is the On-track green from statsPalette.ts: a solid saturated mint
 * in the dark theme, and a deep rich green in the light theme. Both are opaque.
 * danger* marks SOS and safety notices, and a pending connection request
 * on People. Stats tiles and the nutrition charts use statsPalette.ts.
 * Workout charts use one fixed colour per type, in workoutTypeColor.ts,
 * and only so a stacked series can be told apart.
 */
const light = {
  bg: '#F2F2EE',
  sunken: '#E4E4DE',
  surface: '#FFFFFF',
  ink: '#111111',
  muted: '#4C4C47',
  /** Empty-field hint. Lighter than ink, still 4.5:1 on the white field. */
  placeholder: '#6B6B64',
  line: '#D0D0C8',
  emphasis: '#111111',
  emphasisSoft: '#E4E4DE',
  danger: '#8C1D18',
  dangerInk: '#FFF8F6',
  dangerSoft: '#E8E8E3',
  dangerFill: '#8C1D18',
  shadow: 'rgba(0, 0, 0, 0.08)',
};

const dark = {
  bg: '#0C0C0C',
  sunken: '#171717',
  surface: '#1A1A1A',
  ink: '#F3F3EE',
  muted: '#B3B3AC',
  /** Empty-field hint. Darker than ink, still 4.5:1 on the dark field. */
  placeholder: '#8E8E86',
  line: '#3A3A3A',
  emphasis: '#F3F3EE',
  emphasisSoft: '#2A2A2A',
  danger: '#F07167',
  dangerInk: '#FFF8F6',
  dangerSoft: '#242424',
  dangerFill: '#9E221C',
  shadow: 'rgba(0, 0, 0, 0.5)',
};

export type Scheme = 'light' | 'dark';
/** Base greys, plus the On-track accent for card edges. */
export type Palette = typeof light & { accent: string };

/** Main cards use md. Smaller notes and badges use sm. */
export const radius = { sm: 14, md: 20 } as const;

/** Solid edges. Featured cards are a touch heavier. Controls match the card weight in grey or ink. */
export const stroke = { control: 2, card: 2, featured: 2.5 } as const;

export const font = {
  display: 'Oswald_700Bold',
  body: 'Barlow_400Regular',
  bodyItalic: 'Barlow_400Regular_Italic',
  bodyStrong: 'Barlow_600SemiBold',
} as const;

const scales: Record<TextScale, number> = { default: 1, large: 1.15, extra: 1.32 };

type ThemeValue = {
  scheme: Scheme;
  colors: Palette;
  scale: number;
  radius: typeof radius;
  font: typeof font;
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
      colors: { ...(scheme === 'dark' ? dark : light), accent: statsToneColors(scheme).good.ink },
      scale: scales[textScale],
      radius,
      font,
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
