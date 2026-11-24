import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ExpandableRow } from '@/ui/ExpandableRow';

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
  const [open, setOpen] = useState(false);
  const header = `${title} · ${choice}`;
  return (
    <View style={{ gap: 8 }}>
      <ExpandableRow
        label={header}
        accessibilityLabel={header}
        expanded={open}
        onPress={() => setOpen((value) => !value)}
      />
      {open ? <View style={{ gap: 8 }}>{children}</View> : null}
    </View>
  );
}
