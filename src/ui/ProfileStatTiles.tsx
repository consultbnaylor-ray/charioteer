import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { PROFILE_NOT_SHARED, type ProfileStatChart, type ProfileStatTile } from '@/domain/profileStatTiles';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** Compact monochrome tiles for stats a profile already shares. */
export function ProfileStatBoard({ tiles, notShared }: { tiles: ProfileStatTile[]; notShared: string[] }) {
  if (!tiles.length && !notShared.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {tiles.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tiles.map((tile) => <StatTile key={tile.id} tile={tile} />)}
        </View>
      ) : null}
      {notShared.length ? (
        <T variant="muted">{`${PROFILE_NOT_SHARED}: ${notShared.join(', ')}`}</T>
      ) : null}
    </View>
  );
}

function StatTile({ tile }: { tile: ProfileStatTile }) {
  const theme = useAppTheme();
  const caption = tile.caption && tile.caption !== tile.value ? tile.caption : '';
  const spoken = [tile.label, tile.value, caption].filter(Boolean).join('. ');
  return (
    <View
      accessibilityLabel={`${spoken}.`}
      style={{
        flexGrow: 1,
        flexBasis: '46%',
        minWidth: 140,
        gap: 4,
        padding: 8,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <T variant="label">{tile.label}</T>
      <T numberOfLines={4} style={{ fontFamily: theme.font.bodyStrong }}>{tile.value}</T>
      <TileChart chart={tile.chart} />
      {caption ? <T variant="muted" numberOfLines={3}>{caption}</T> : null}
    </View>
  );
}

function TileChart({ chart }: { chart: ProfileStatChart | null }) {
  if (!chart) return null;
  if (chart.kind === 'ring') return <MiniRing fill={chart.fill} />;
  if (chart.kind === 'line') return <MiniLine values={chart.values} />;
  return <MiniBars values={chart.values} />;
}

function MiniRing({ fill }: { fill: number }) {
  const theme = useAppTheme();
  const size = 36;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const mid = size / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(1, fill));
  return (
    <Svg width={size} height={size} accessibilityElementsHidden>
      <Circle cx={mid} cy={mid} r={radius} stroke={theme.colors.line} strokeWidth={stroke} fill="none" />
      {shown > 0 ? (
        <Circle
          cx={mid}
          cy={mid}
          r={radius}
          stroke={theme.colors.ink}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * shown} ${circumference}`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      ) : null}
    </Svg>
  );
}

function MiniBars({ values }: { values: number[] }) {
  const theme = useAppTheme();
  const max = Math.max(...values, 0);
  if (max <= 0) return null;
  return (
    <View accessibilityElementsHidden style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28 }}>
      {values.map((value, index) => {
        const fraction = Math.max(0, Math.min(1, value / max));
        return (
          <View key={`${index}:${value}`} style={{ flex: 1, height: 28, justifyContent: 'flex-end', backgroundColor: theme.colors.line, borderRadius: 2 }}>
            {fraction > 0 ? (
              <View style={{ height: Math.max(2, fraction * 28), backgroundColor: theme.colors.ink, borderRadius: 2 }} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function MiniLine({ values }: { values: number[] }) {
  const theme = useAppTheme();
  if (values.length < 2) return <MiniBars values={values} />;
  const width = 120;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (width - 4) + 2;
    const y = height - 3 - ((value - min) / span) * (height - 8);
    return `${x},${y}`;
  }).join(' ');
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityElementsHidden>
      <Polyline points={points} fill="none" stroke={theme.colors.ink} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
