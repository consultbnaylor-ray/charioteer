import { View } from 'react-native';

import type { HealthFigure, MeasureBars, MeasureRing, MeasureSplit, MeasureZone } from '@/domain/measureFigures';
import type { StatIcon } from '@/domain/statIcons';
import { CompareBars, ProgressRing, RangeTrack } from '@/ui/DistanceCharts';
import { IconLabel } from '@/ui/statIcons';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** Ring, note, and the plain-words line. The same arrangement as Energy today. */
export function MeasureRingView({ label, ring, detail, icon }: { label: string; ring: MeasureRing; detail?: string; icon?: StatIcon }) {
  const caption = detail ? `${ring.centre} ${ring.unit}. ${ring.status}. ${detail}` : undefined;
  return (
    <View style={{ alignItems: 'center', gap: 4, alignSelf: 'stretch' }}>
      {icon ? <IconLabel name={icon}>{label}</IconLabel> : <T variant="label">{label}</T>}
      <ProgressRing
        centre={ring.centre}
        unit={ring.unit}
        fill={ring.fill}
        status={ring.status}
        tone={ring.tone}
        signal={ring.signal}
        monochrome={ring.neutral}
        surface="card"
        size={108}
        mark
        spoken
        caption={caption}
      />
    </View>
  );
}

/** Labelled horizontal bars. The value sits in the label, then one sentence. */
export function MeasureBarsView({ label, bars }: { label?: string; bars: MeasureBars }) {
  return (
    <View accessibilityLabel={bars.caption} style={{ gap: 8, alignSelf: 'stretch' }}>
      {label && bars.bars.length > 0 ? <T variant="label">{label}</T> : null}
      {bars.bars.length > 0 ? <CompareBars layout="row" max={bars.max} bars={bars.bars} /> : null}
      <T variant="muted">{bars.caption}</T>
    </View>
  );
}

/** Shaded healthy band. The caption names the band, so the green is not the only cue. */
export function MeasureZoneView({ zone }: { zone: MeasureZone }) {
  return (
    <RangeTrack
      value={zone.value}
      zoneLow={zone.zoneLow}
      zoneHigh={zone.zoneHigh}
      scaleMin={zone.scaleMin}
      scaleMax={zone.scaleMax}
      status={zone.status}
      zoneCaption={zone.zoneCaption}
      tone={zone.tone}
      surface="card"
      showStatus={false}
    />
  );
}

/** Two parts of one total, with a word on each side and one sentence under it. */
export function MeasureSplitView({ label, split }: { label: string; split: MeasureSplit }) {
  const theme = useAppTheme();
  const colors = statsToneColors(theme.scheme);
  const total = split.left + split.right;
  const share = total > 0 ? split.left / total : 0;
  const rightTone = split.rightTone;
  return (
    <View accessibilityLabel={split.caption} style={{ gap: 8, alignSelf: 'stretch' }}>
      <T variant="label">{label}</T>
      <View style={{ height: 16, borderRadius: 8, backgroundColor: theme.colors.line, overflow: 'hidden', flexDirection: 'row' }}>
        {total > 0 ? (
          <>
            <View style={{ width: `${Math.round(share * 100)}%`, backgroundColor: colors.good.ink }} />
            <View style={{ width: `${100 - Math.round(share * 100)}%`, backgroundColor: colors[rightTone].ink }} />
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T style={{ color: colors.good.ink, fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale }}>{split.leftLabel}</T>
        <T style={{ color: colors[rightTone].ink, fontSize: 13 * theme.scale, lineHeight: 18 * theme.scale }}>{split.rightLabel}</T>
      </View>
      <T variant="muted">{split.caption}</T>
    </View>
  );
}

export function HealthFigureView({ figure }: { figure: HealthFigure | null }) {
  if (!figure?.ring && !figure?.zone && !figure?.bars) return null;
  return (
    <View style={{ gap: 12, alignSelf: 'stretch' }}>
      {figure.ring ? <MeasureRingView label={figure.ring.label} ring={figure.ring.ring} detail={figure.zone?.zoneCaption} /> : null}
      {figure.zone ? <MeasureZoneView zone={figure.zone} /> : null}
      {figure.bars ? <MeasureBarsView label={figure.bars.label} bars={figure.bars.bars} /> : null}
    </View>
  );
}
