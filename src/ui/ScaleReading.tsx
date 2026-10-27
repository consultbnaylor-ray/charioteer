import { View } from 'react-native';

import { useSnapshot } from '@/data';
import { compositionForAssessment, weightPointsFrom } from '@/domain/nutrition';
import {
  SCALE_COMPARE_LINE,
  SCALE_CORE_LINE,
  SCALE_EMPTY_LINE,
  SCALE_MORE_ARRIVES,
  SCALE_MORE_BAND,
  SCALE_MORE_BMI,
  SCALE_SOURCES,
  scaleReadingFigures,
} from '@/domain/scaleReading';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import { MoreInfo } from '@/ui/MoreInfo';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** Weight and BMI beside body fat and lean mass. The same block on Stats, the plan, and Weight. */
export function ScaleReadingNote() {
  const snap = useSnapshot();
  const theme = useAppTheme();
  const weights = weightPointsFrom(snap.health);
  const latest = weights.length ? weights[weights.length - 1] : undefined;
  const body = compositionForAssessment(snap.bodyComposition);
  const view = scaleReadingFigures({
    weightKg: latest?.kg ?? null,
    heightCm: snap.profile?.heightCm ?? null,
    bodyFatPct: body.bodyFatPct,
    leanMassKg: body.leanMassKg,
  });
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }} accessibilityLabel="Weight, BMI, body fat, and lean mass">
      {view.empty ? <T>{SCALE_EMPTY_LINE}</T> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {view.figures.map((figure) => (
            <View key={figure.label} style={{ minWidth: 108, flexGrow: 1, gap: 2 }}>
              <T variant="muted">{figure.label}</T>
              <T style={{ fontFamily: theme.font.bodyStrong }}>{figure.value}</T>
            </View>
          ))}
        </View>
      )}
      <T>{SCALE_CORE_LINE}</T>
      <T>{SCALE_COMPARE_LINE}</T>
      <MoreInfo about="weight, BMI, body fat, and lean mass">
        <T>{SCALE_MORE_BAND}</T>
        <T>{SCALE_MORE_ARRIVES}</T>
        <T>{SCALE_MORE_BMI}</T>
        {SCALE_SOURCES.map((source) => (
          <T key={source.url} variant="muted">{`${source.name}. ${source.url}`}</T>
        ))}
      </MoreInfo>
      <T variant="muted">{VISIBLE_SAFETY_LINE}</T>
    </View>
  );
}
