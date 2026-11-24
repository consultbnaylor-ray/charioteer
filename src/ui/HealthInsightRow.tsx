import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { insightChip } from '@/domain/compactLines';
import { MoreInfo } from '@/ui/MoreInfo';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

const EMPTY = 'Not enough readings yet to compare the last 7 days with the 7 before.';

/**
 * One chip, then a collapsed About tab for the full sentences.
 * Replaces a full-width insight paragraph.
 */
export function HealthInsightRow({
  headlines,
  onOpen,
}: {
  headlines: readonly string[];
  /** Opens Health Stats. Kept inside About so the chip stays one line. */
  onOpen?: () => void;
}) {
  const theme = useAppTheme();
  const lines = headlines.map((line) => line.trim()).filter(Boolean);
  const chip = lines[0] ? insightChip(lines[0]) : insightChip(EMPTY);
  const spoken = lines.length > 1 ? `${chip}. ${lines.length} insights` : chip;
  return (
    <MoreInfo
      title="Insights"
      about="these insights"
      summary={(
        <View accessibilityLabel={spoken}>
          <T numberOfLines={1}>{chip}</T>
        </View>
      )}
    >
      {(lines.length ? lines : [EMPTY]).map((line) => (
        <T key={line}>{line}</T>
      ))}
      {onOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all health stats"
          onPress={onOpen}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T style={{ fontFamily: theme.font.bodyStrong }}>See all</T>
        </Pressable>
      ) : null}
    </MoreInfo>
  );
}

/** The glance and the rest of Today both open Health Stats from the same row. */
export function TodayInsightRow({ headlines }: { headlines: readonly string[] }) {
  const router = useRouter();
  return (
    <View>
      <HealthInsightRow headlines={headlines} onOpen={() => router.push('/health' as never)} />
    </View>
  );
}
