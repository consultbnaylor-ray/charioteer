import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { SHARE_LIST_PAGE, shareListHasMore, shareListLabel, visibleShareCount } from '@/domain/shareList';
import { Button, T } from '@/ui/ui';

/**
 * A long per-item share list. Closed until opened. Newer rows are already
 * first. Each opening step reveals another page.
 */
export function ShareSwitchList({
  title,
  shared,
  items,
}: {
  title: string;
  shared: number;
  items: ReactNode[];
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(SHARE_LIST_PAGE);
  const total = items.length;
  const visible = visibleShareCount(shown, total);
  const label = shareListLabel(title, shared, total);

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((current) => !current)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={{ flex: 1 }}>{`${title} — ${shared} shared of ${total}`}</T>
          <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
            <T>›</T>
          </View>
        </View>
      </Pressable>
      {open ? (
        <View style={{ gap: 10 }}>
          {items.slice(0, visible)}
          {shareListHasMore(visible, total) ? (
            <Button label="Show more" tone="quiet" onPress={() => setShown((current) => current + SHARE_LIST_PAGE)} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
