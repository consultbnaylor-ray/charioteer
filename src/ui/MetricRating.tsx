import { View } from 'react-native';

import { ratingTone, type MetricReading } from '@/domain/metricRegistry';
import { statsToneColors } from '@/ui/statsPalette';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

function faceLines(rating: MetricReading): string[] {
  if (rating.pending) return rating.where ? [rating.where] : [];
  // A sentence that already says "Rated Good" must not become "Good: Rated Good".
  const named = rating.where.startsWith('Rated ');
  const text = (named ? rating.where : `${rating.label}: ${rating.where}`).replace(/\s+/g, ' ').trim();
  const parts = text.split(/(?<=\.)\s+/).map((line) => line.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

/** Hide the chip until there is a real rating. Pending copy stays in the toggle. */
export function RatingChipFor({ rating, plain = false }: { rating: MetricReading | null | undefined; plain?: boolean }) {
  if (!rating || rating.pending) return null;
  return <RatingChip label={rating.label} plain={plain} />;
}

/** A short colour word beside the chart. The sentences stay in What this Data means. */
export function RatingChip({ label, plain = false }: { label: string; plain?: boolean }) {
  const theme = useAppTheme();
  const tone = ratingTone(label);
  const palette = statsToneColors(theme.scheme)[tone];
  const ink = plain ? theme.colors.ink : palette.ink;
  const fill = plain ? 'transparent' : palette.bg;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Rating, ${label}`}
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: ink,
        backgroundColor: fill,
      }}
    >
      <T style={{ color: ink, fontFamily: theme.font.bodyStrong }}>{label}</T>
    </View>
  );
}

/** The label, the comparison, the aim, and tips. The source stays in What this Data means so it is named once. */
export function MetricRatingLines({ rating }: { rating: MetricReading | null | undefined }) {
  const theme = useAppTheme();
  if (!rating) return null;
  const tone = ratingTone(rating.label);
  const ink = statsToneColors(theme.scheme)[tone].ink;
  return (
    <View style={{ gap: 4 }}>
      {rating.pending ? <T>No rating yet</T> : null}
      {faceLines(rating).map((line, index) => (
        <T key={line} style={index === 0 && !rating.pending ? { color: ink } : undefined}>{line}</T>
      ))}
      {rating.inputs?.map((line) => (
        <T key={line.name}>{`${line.name}: ${line.detail}`}</T>
      ))}
      {rating.goalLine ? <T variant="muted">{rating.goalLine}</T> : null}
      {rating.why ? (
        <View style={{ gap: 4 }}>
          <T variant="label">Why it matters</T>
          <T>{rating.why.body}</T>
          <T variant="muted">{rating.why.sources}</T>
        </View>
      ) : null}
      {rating.tips.map((tip) => <T key={tip}>{tip}</T>)}
    </View>
  );
}
