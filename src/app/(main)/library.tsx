import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useSnapshot } from '@/data';
import { CATEGORY_LABELS } from '@/data/catalogue';
import type { ResourceCategory } from '@/data/types';
import { libraryItems, ON_THE_MEND_APPS, ON_THE_MEND_ID, ON_THE_MEND_LINKS, ON_THE_MEND_PARAGRAPHS } from '@/domain/onTheMend';
import { Card, Choice, Screen, Stamp, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

const ORDER: ResourceCategory[] = ['helplines', 'groups', 'quit_lit', 'health'];

export default function Library() {
  const snap = useSnapshot();
  const theme = useAppTheme();
  const [category, setCategory] = useState<ResourceCategory | 'all'>('all');
  const items = libraryItems(snap.resources, category);

  return (
    <Screen eyebrow="Library" title="Help, books, and health." intro="Phone numbers and links were checked where the note says so. Anything we could not confirm is marked.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Choice label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
        {ORDER.map((item) => (
          <Choice key={item} label={CATEGORY_LABELS[item]} selected={category === item} onPress={() => setCategory(item)} />
        ))}
      </View>
      {items.map((item) => (
        <Card key={item.id}>
          <T variant="label">{CATEGORY_LABELS[item.category]}</T>
          <T variant="title">{item.title}</T>
          {item.id === ON_THE_MEND_ID ? (
            <>
              {ON_THE_MEND_PARAGRAPHS.map((paragraph) => <T key={paragraph}>{paragraph}</T>)}
              <T>{ON_THE_MEND_APPS}</T>
              {ON_THE_MEND_LINKS?.map((link) => (
                <Pressable key={link.url} accessibilityRole="link" accessibilityLabel={link.label} onPress={() => void Linking.openURL(link.url)}>
                  <T style={{ color: theme.colors.ink, fontFamily: theme.font.bodyStrong, textDecorationLine: 'underline' }}>{link.label}</T>
                </Pressable>
              ))}
            </>
          ) : (
            <T>{item.detail}</T>
          )}
          {item.phone ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${item.phone?.replace(/\s/g, '')}`)}>
              <T style={{ color: theme.colors.danger, fontFamily: theme.font.bodyStrong }}>{item.phone}</T>
            </Pressable>
          ) : null}
          {item.url ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.url!)}>
              <T style={{ color: theme.colors.ink, fontFamily: theme.font.bodyStrong, textDecorationLine: 'underline' }}>Open link</T>
            </Pressable>
          ) : null}
          <Stamp kind={item.verification} />
          <T variant="muted">{item.verificationNote}</T>
        </Card>
      ))}
      {items.length === 0 ? <T variant="muted">Nothing in this category yet.</T> : null}
    </Screen>
  );
}
