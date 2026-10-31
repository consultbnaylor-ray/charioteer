import { useRouter } from 'expo-router';
import Svg from 'react-native-svg';

import { Pressable, View } from 'react-native';

import type { DistanceChart } from '@/domain/distance';
import type { StatTileModel } from '@/domain/statsOverview';
import { CompareBars, ProgressRing, RangeTrack, ToneMark, TrendLine } from '@/ui/DistanceCharts';
import { ProcessedFoodList } from '@/ui/ProcessedFoodList';
import { ReadingChart } from '@/ui/ReadingChart';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

function chartStatus(chart: DistanceChart): string | null {
  if (chart.kind === 'ring' || chart.kind === 'range') return chart.status;
  return null;
}

function TileChart({ chart, tone, signal, monochrome }: { chart: DistanceChart; tone: StatTileModel['tone']; signal?: string; monochrome?: boolean }) {
  const theme = useAppTheme();
  const ink = monochrome ? theme.colors.ink : statsToneColors(theme.scheme)[tone].ink;
  if (chart.kind === 'ring') {
    return (
      <ProgressRing
        centre={chart.centre}
        unit={chart.unit}
        fill={chart.fill}
        status={chart.status}
        tone={tone}
        signal={signal}
        monochrome={monochrome}
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
  if (chart.kind === 'line') {
    if (chart.readings && chart.readings.length > 0 && chart.start && chart.end) {
      return (
        <ReadingChart
          points={chart.readings}
          start={chart.start}
          end={chart.end}
          unit={chart.unit ?? ''}
          aggregate="mean"
          accessibilityLabel="Chart"
        />
      );
    }
    return <TrendLine points={chart.points} color={ink} />;
  }
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
  const neutral = tile.signal === 'Early days' || tile.signal === 'On pace';
  const palette = statsToneColors(theme.scheme)[tile.tone];
  const tone = neutral ? { bg: theme.colors.surface, ink: theme.colors.ink } : palette;
  const iconTone = tile.signal === 'On pace' ? 'good' : tile.signal === 'Early days' ? 'info' : tile.tone;
  const ink = { color: tone.ink };
  const status = chartStatus(tile.chart);
  const meaning = tile.meaning === tile.signal || tile.meaning === status ? null : tile.meaning;
  const spoken = [tile.title, tile.value, tile.signal, tile.meaning, status && status !== tile.meaning ? status : '']
    .filter(Boolean)
    .join('. ');
  return (
    <Card style={{ backgroundColor: tone.bg, borderColor: tone.ink, alignSelf: 'stretch' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${spoken}.`}
        onPress={() => router.push(tile.href as never)}
        style={{ gap: 8 }}
      >
        <T style={[ink, { fontFamily: theme.font.bodyStrong, fontSize: 16, lineHeight: 22, letterSpacing: 0, textTransform: 'none', marginBottom: 4 }]}>{tile.title}</T>
        {tile.chart.kind === 'ring' ? null : <T variant="title" style={ink}>{tile.value}</T>}
        {tile.periodLine ? <T variant="muted">{tile.periodLine}</T> : null}
        <TileChart chart={tile.chart} tone={tile.tone} signal={tile.signal} monochrome={neutral} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <ToneMark tone={iconTone} color={tone.ink} />
          </Svg>
          <T style={[ink, { fontFamily: theme.font.bodyStrong }]}>{tile.signal}</T>
        </View>
        {meaning ? <T style={ink}>{meaning}</T> : null}
      </Pressable>
      <ProcessedFoodList notes={tile.processedNotes ?? []} />
    </Card>
  );
}
