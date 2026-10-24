import { Pressable, Text, View } from 'react-native';

import { stroke, useAppTheme } from '@/ui/theme';

/** Selected interests are filled with a white border and a check. Others stay muted. */
export function InterestChip({
  label,
  selected,
  custom,
  onPress,
  onRemove,
}: {
  label: string;
  selected: boolean;
  custom?: boolean;
  onPress: () => void;
  onRemove?: () => void;
}) {
  const theme = useAppTheme();
  const fg = selected ? theme.colors.bg : theme.colors.muted;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        borderWidth: stroke.control,
        borderColor: selected ? '#FFFFFF' : theme.colors.line,
        backgroundColor: selected ? theme.colors.ink : theme.colors.sunken,
        borderRadius: theme.radius.md,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        {selected ? (
          <Text style={{ color: fg, fontFamily: theme.font.bodyStrong, fontSize: 15 * theme.scale }}>✓</Text>
        ) : null}
        <Text style={{ color: fg, fontFamily: theme.font.bodyStrong, fontSize: 15 * theme.scale }}>{label}</Text>
      </Pressable>
      {custom && onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          hitSlop={4}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: fg, fontFamily: theme.font.bodyStrong, fontSize: 18 * theme.scale }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
