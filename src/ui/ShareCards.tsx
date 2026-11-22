import { Share, View } from 'react-native';

import { useAppTheme } from '@/ui/theme';
import { Button, Card, T } from '@/ui/ui';

export type ShareCardModel = {
  kicker: string;
  title: string;
  figure: string;
  unit: string;
  lines: readonly string[];
  message: string;
};

/** A house-style card the person can share. The message uses only figures already on screen. */
export function ShareCard({ card, label = 'Share' }: { card: ShareCardModel; label?: string }) {
  const theme = useAppTheme();
  return (
    <Card compact style={{ borderColor: theme.grid.sobriety, gap: 8 }}>
      <T variant="label" style={{ color: theme.grid.sobriety }}>{card.kicker}</T>
      <T variant="title">{card.title}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <T variant="display" style={{ fontSize: 48 * theme.scale, lineHeight: 52 * theme.scale }}>{card.figure}</T>
        <T variant="muted">{card.unit}</T>
      </View>
      {card.lines.map((line) => <T key={line}>{line}</T>)}
      <Button label={label} tone="quiet" onPress={() => { void Share.share({ message: card.message }); }} />
    </Card>
  );
}
