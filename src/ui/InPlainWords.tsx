import { Text, View } from 'react-native';

import { useAppTheme } from '@/ui/theme';

/** Label shown above Charioteer’s paraphrase. The ancient line stays the translation. */
export const IN_PLAIN_WORDS = 'In plain words';

/** Makes clear the modern line is not the author’s wording. */
export const PLAIN_WORDS_MARK = 'Charioteer’s own words, not the author’s.';

export function InPlainWords({ plain }: { plain: string }) {
  const theme = useAppTheme();
  const size = theme.scale;
  const text = plain.trim();
  if (!text) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text
        maxFontSizeMultiplier={2}
        style={{
          fontFamily: theme.font.bodyItalic,
          fontSize: 13 * size,
          lineHeight: 19 * size,
          color: theme.colors.muted,
        }}
      >
        {IN_PLAIN_WORDS}: {text}
      </Text>
      <Text
        maxFontSizeMultiplier={2}
        style={{
          fontFamily: theme.font.body,
          fontSize: 12 * size,
          lineHeight: 16 * size,
          color: theme.colors.muted,
        }}
      >
        {PLAIN_WORDS_MARK}
      </Text>
    </View>
  );
}
