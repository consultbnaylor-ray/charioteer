import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import {
  buildHealthStatBoard,
  type HealthStatBoardInput,
  type HealthStatTile,
  type HealthStatVisual,
} from '@/domain/healthStatTiles';
import { STATS_SIGNAL } from '@/domain/statsOverview';
import { CompareBars, ProgressRing, RangeTrack, ToneMark, TrendLine } from '@/ui/DistanceCharts';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { Button, Card, T } from '@/ui/ui';

/** Grouped tiles for this person's own readings. Sharing stays on the switches already on this page. */
export function HealthStatBoard(input: HealthStatBoardInput) {
  const model = buildHealthStatBoard(input);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = model.sections.flatMap((section) => section.tiles).find((tile) => tile.id === openId) ?? null;
  if (model.sections.length === 0 && !model.missingLine) return null;
  return (
    <View style={{ gap: 14 }}>
      {model.sections.map((section) => (
        <StatSection key={section.id} title={section.title} tiles={section.tiles} onOpen={setOpenId} />
      ))}
      {model.missingLine ? <T variant="muted">{model.missingLine}</T> : null}
      <StatDetail tile={open} caveat={model.caveat} onClose={() => setOpenId(null)} />
    </View>
  );
}

function StatSection({
  title,
  tiles,
  onOpen,
}: {
  title: string;
  tiles: HealthStatTile[];
  onOpen: (id: string) => void;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(true);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>{title}</T>
        <T variant="muted">{open ? 'Hide' : 'Show'}</T>
      </Pressable>
      {open ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tiles.map((tile) => (
            <StatTile key={tile.id} tile={tile} onOpen={() => onOpen(tile.id)} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function StatTile({ tile, onOpen }: { tile: HealthStatTile; onOpen: () => void }) {
  const theme = useAppTheme();
  const spoken = `More info about ${tile.title}. ${tile.valueText} ${tile.unit}. ${tile.mark}. ${tile.status}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onOpen}
      style={{
        flexGrow: 1,
        flexBasis: '46%',
        minWidth: 148,
        gap: 6,
        padding: 8,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <T variant="label">{tile.title}</T>
      {tile.visual.kind === 'ring' ? null : (
        <T style={{ fontFamily: theme.font.bodyStrong }}>{tile.valueText} {tile.unit}</T>
      )}
      <TileVisual visual={tile.visual} />
      {tile.visual.kind === 'ring' || tile.visual.kind === 'zone' ? null : (
        <StatusMark tone={tile.tone} status={tile.status} />
      )}
      {tile.history.length >= 2 && tile.visual.kind !== 'line' ? (
        <TrendLine points={tile.history} color={statsToneColors(theme.scheme)[tile.tone].ink} />
      ) : null}
      {tile.trend ? <T variant="muted">{tile.trend}</T> : null}
      <T variant="muted">More info</T>
    </Pressable>
  );
}

function TileVisual({ visual }: { visual: HealthStatVisual }) {
  const theme = useAppTheme();
  if (visual.kind === 'line') return <TrendLine points={visual.points} color={theme.colors.ink} />;
  if (visual.kind === 'ring') {
    return (
      <ProgressRing
        centre={visual.centre}
        unit={visual.unit}
        fill={visual.fill}
        status={visual.status}
        tone={visual.tone}
        surface="card"
        size={84}
        mark
      />
    );
  }
  if (visual.kind === 'zone') {
    return (
      <RangeTrack
        value={visual.value}
        zoneLow={visual.zoneLow}
        zoneHigh={visual.zoneHigh}
        scaleMin={visual.scaleMin}
        scaleMax={visual.scaleMax}
        status={visual.status}
        zoneCaption={visual.zoneCaption}
        tone={visual.tone}
        surface="card"
        mark
      />
    );
  }
  if (visual.kind === 'bars') {
    return (
      <View style={{ gap: 6, alignSelf: 'stretch' }}>
        <CompareBars layout="row" max={visual.max} bars={visual.bars} />
        {visual.caption ? <T variant="muted">{visual.caption}</T> : null}
      </View>
    );
  }
  return null;
}

function StatusMark({ tone, status }: { tone: HealthStatTile['tone']; status: string }) {
  const theme = useAppTheme();
  const color = statsToneColors(theme.scheme)[tone].ink;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
          <ToneMark tone={tone} color={color} />
        </Svg>
        <T style={{ color, fontFamily: theme.font.bodyStrong }}>{STATS_SIGNAL[tone]}</T>
      </View>
      <T>{status}</T>
    </View>
  );
}

function StatDetail({
  tile,
  caveat,
  onClose,
}: {
  tile: HealthStatTile | null;
  caveat: string;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const bodyHeight = Math.max(280, Math.round(height * 0.92) - 168 - insets.bottom);
  const ink = tile ? statsToneColors(theme.scheme)[tile.tone].ink : theme.colors.ink;
  return (
    <Modal visible={tile != null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 16 + insets.bottom,
            gap: 12,
            maxHeight: '92%',
          }}
        >
          <T variant="title">{tile?.title ?? 'More info'}</T>
          <Button label="Close" tone="quiet" onPress={onClose} />
          {tile ? (
            <ScrollView style={{ flexGrow: 0, height: bodyHeight }}>
              <View style={{ gap: 12, paddingBottom: 8 }}>
                <T variant="label">What this is</T>
                <T>{tile.about}</T>
                <T style={{ fontFamily: theme.font.bodyStrong }}>{tile.valueText} {tile.unit}</T>
                <TileVisual visual={tile.visual} />
                <StatusMark tone={tile.tone} status={tile.status} />
                <T variant="label">What your number means</T>
                <T>{tile.meaning}</T>
                {tile.rangeNote && tile.rangeNote !== tile.meaning ? <T>{tile.rangeNote}</T> : null}
                {tile.history.length >= 2 ? <TrendLine points={tile.history} color={ink} /> : null}
                {tile.trend ? <T variant="muted">{tile.trend}</T> : null}
                {tile.sourceUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(tile.sourceUrl!)}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <T variant="muted">{tile.sourceName}</T>
                  </Pressable>
                ) : tile.sourceName ? <T variant="muted">{tile.sourceName}</T> : null}
                <T variant="muted">{caveat}</T>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
