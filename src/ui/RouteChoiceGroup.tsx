import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * One route question, collapsed until it is opened.
 * The header keeps the current choice, so the defaults still apply while it is shut.
 */
export function RouteChoiceGroup({
  title,
  choice,
  children,
}: {
  title: string;
  choice: string;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const header = `${title} · ${choice}`;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={header}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong }}>{header}</T>
      </Pressable>
      {open ? <View style={{ gap: 8 }}>{children}</View> : null}
    </View>
  );
}
