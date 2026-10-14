import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import type { StatTileModel } from '@/domain/statsOverview';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

function ToneMark({ tone, color }: { tone: StatTileModel['tone']; color: string }) {
  if (tone === 'good') {
    return <Path d="M5 12.2 9.2 16.2 19 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (tone === 'watch') {
    return <Path d="M12 5.2 20 18.2H4L12 5.2zM12 10v3.4M12 16.2v.2" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />;
  }
  if (tone === 'attention') {
    return <Path d="M12 6v7M12 16.4v.3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />;
  }
  return (
    <>
      <Circle cx={12} cy={12} r={7} stroke={color} strokeWidth={1.6} />
      <Path d="M12 11v5M12 8.2v.2" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 132;
  const height = 36;
  if (values.length < 2) {
    return (
      <Svg width={width} height={height} accessibilityElementsHidden>
        <Line x1={4} y1={height / 2} x2={width - 4} y2={height / 2} stroke={color} strokeWidth={1.5} strokeDasharray="3 3" />
      </Svg>
    );
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const points = values.map((value, index) => {
    const x = 4 + (index / (values.length - 1)) * (width - 8);
    const y = 4 + (1 - (value - low) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Svg width={width} height={height} accessibilityElementsHidden>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

export function StatTile({ tile }: { tile: StatTileModel }) {
  const theme = useAppTheme();
  const router = useRouter();
  const tone = statsToneColors(theme.scheme)[tile.tone];
  const ink = { color: tone.ink };
  const meaning = tile.meaning === tile.signal ? null : tile.meaning;
  return (
    <Card
      accessibilityLabel={`${tile.title}. ${tile.value}. ${tile.signal}. ${tile.meaning}.`}
      onPress={() => router.push(tile.href as never)}
      style={{ backgroundColor: tone.bg, borderColor: tone.ink, flex: 1, minHeight: 168 }}
    >
      <T variant="label" style={ink}>{tile.title}</T>
      <T variant="title" style={ink}>{tile.value}</T>
      <Sparkline values={tile.series} color={tone.ink} />
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
        <ToneMark tone={tile.tone} color={tone.ink} />
      </Svg>
      <T style={[ink, { fontFamily: theme.font.bodyStrong }]}>{tile.signal}</T>
      {meaning ? <T style={ink}>{meaning}</T> : null}
    </Card>
  );
}
