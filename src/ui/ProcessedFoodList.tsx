import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { PROCESSED_LIST_FOLD, processedSeeLabel, type ProcessedFoodNote } from '@/domain/nutrition';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * The foods behind a highly processed count.
 * Starts closed. A long list keeps the tail behind a second dropdown.
 * Opening it does not move the page.
 */
export function ProcessedFoodList({
  notes,
  cue = 'see',
  periodLine,
  heading,
}: {
  notes: readonly ProcessedFoodNote[];
  cue?: 'see' | 'more';
  periodLine?: string;
  heading?: string;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [rest, setRest] = useState(false);
  if (notes.length === 0) return null;
  const see = processedSeeLabel(notes.length);
  const folded = notes.length > PROCESSED_LIST_FOLD;
  const shown = open && folded && !rest ? notes.slice(0, PROCESSED_LIST_FOLD) : notes;
  const hidden = notes.length - PROCESSED_LIST_FOLD;

  return (
    <View
      style={{
        alignSelf: 'stretch',
        gap: 4,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.md,
        paddingHorizontal: 12,
        paddingVertical: 4,
      }}
    >
      {heading ? <T style={{ color: theme.colors.ink, fontFamily: theme.font.bodyStrong }}>{heading}</T> : null}
      {periodLine ? <T variant="muted">{periodLine}</T> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cue === 'more' ? `More info. ${see}` : see}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        {cue === 'more' ? <T style={{ color: theme.colors.ink }}>More info</T> : null}
        <T style={{ color: theme.colors.ink }}>{open ? 'Hide' : see}</T>
      </Pressable>
      {open ? shown.map((note) => (
        <View key={note.id} style={{ gap: 2, paddingBottom: 10, borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: 8 }}>
          <T style={{ color: theme.colors.ink, fontFamily: theme.font.bodyStrong }}>{note.name}</T>
          <T variant="muted">{`${note.meal} · ${note.date}`}</T>
          <T style={{ color: theme.colors.ink }}>{note.reason}</T>
          <T variant="muted">{note.suggestion}</T>
        </View>
      )) : null}
      {open && folded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rest ? 'Hide the rest' : `Show ${hidden} more`}
          accessibilityState={{ expanded: rest }}
          onPress={() => setRest((value) => !value)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T style={{ color: theme.colors.ink }}>{rest ? 'Hide the rest' : `Show ${hidden} more`}</T>
        </Pressable>
      ) : null}
    </View>
  );
}
