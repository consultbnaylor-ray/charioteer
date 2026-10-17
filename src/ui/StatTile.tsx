import { useRouter } from 'expo-router';
import { View } from 'react-native';
import Svg from 'react-native-svg';

import type { DistanceChart } from '@/domain/distance';
import type { StatTileModel } from '@/domain/statsOverview';
import { CompareBars, ProgressRing, RangeTrack, ToneMark, TrendLine } from '@/ui/DistanceCharts';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

function chartStatus(chart: DistanceChart): string | null {
  if (chart.kind === 'ring' || chart.kind === 'range') return chart.status;
  return null;
}

function TileChart({ chart, tone }: { chart: DistanceChart; tone: StatTileModel['tone'] }) {
  const theme = useAppTheme();
  const ink = statsToneColors(theme.scheme)[tone].ink;
  if (chart.kind === 'ring') {
    return (
      <ProgressRing
        centre={chart.centre}
        unit={chart.unit}
        fill={chart.fill}
        status={chart.status}
        tone={tone}
        surface="tile"
      />
    );
  }
  if (chart.kind === 'bars') {
    return (
      <CompareBars
        bars={chart.bars}
        max={chart.max}
        target={chart.target}
        layout={chart.layout ?? 'column'}
        showLabels={chart.bars.length <= 7}
      />
    );
  }
  if (chart.kind === 'line') return <TrendLine points={chart.points} color={ink} />;
  if (chart.kind === 'range') {
    return (
      <RangeTrack
        value={chart.value}
        zoneLow={chart.zoneLow}
        zoneHigh={chart.zoneHigh}
        scaleMin={chart.scaleMin}
        scaleMax={chart.scaleMax}
        status={chart.status}
        zoneCaption={chart.zoneCaption}
        tone={tone}
        surface="tile"
      />
    );
  }
  return null;
}

export function StatTile({ tile }: { tile: StatTileModel }) {
  const theme = useAppTheme();
  const router = useRouter();
  const tone = statsToneColors(theme.scheme)[tile.tone];
  const ink = { color: tone.ink };
  const status = chartStatus(tile.chart);
  const meaning = tile.meaning === tile.signal || tile.meaning === status ? null : tile.meaning;
  const spoken = [tile.title, tile.value, tile.signal, tile.meaning, status && status !== tile.meaning ? status : '']
    .filter(Boolean)
    .join('. ');
  return (
    <Card
      accessibilityLabel={`${spoken}.`}
      onPress={() => router.push(tile.href as never)}
      style={{ backgroundColor: tone.bg, borderColor: tone.ink, flex: 1, minHeight: 168 }}
    >
      <T variant="label" style={ink}>{tile.title}</T>
      {tile.chart.kind === 'ring' ? null : <T variant="title" style={ink}>{tile.value}</T>}
      <TileChart chart={tile.chart} tone={tile.tone} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
          <ToneMark tone={tile.tone} color={tone.ink} />
        </Svg>
        <T style={[ink, { fontFamily: theme.font.bodyStrong }]}>{tile.signal}</T>
      </View>
      {meaning ? <T style={ink}>{meaning}</T> : null}
    </Card>
  );
}
