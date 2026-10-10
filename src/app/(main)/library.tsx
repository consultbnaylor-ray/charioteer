import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useSnapshot } from '@/data';
import { CATEGORY_LABELS } from '@/data/catalogue';
import type { ResourceCategory } from '@/data/types';
import { Card, Choice, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

const ORDER: ResourceCategory[] = ['helplines', 'groups', 'quit_lit', 'health'];

export default function Library() {
  const snap = useSnapshot();
  const theme = useAppTheme();
  const [category, setCategory] = useState<ResourceCategory | 'all'>('all');
  const items = snap.resources.filter((item) => category === 'all' || item.category === category);

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
          <T>{item.detail}</T>
          {item.phone ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${item.phone?.replace(/\s/g, '')}`)}>
              <T style={{ color: theme.colors.copper, fontFamily: theme.font.bodyStrong }}>{item.phone}</T>
            </Pressable>
          ) : null}
          {item.url ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.url!)}>
              <T style={{ color: theme.colors.copper, textDecorationLine: 'underline' }}>Open link</T>
            </Pressable>
          ) : null}
          <T variant="muted">
            {item.verification === 'verified' ? 'Checked. ' : item.verification === 'partial' ? 'Partly checked. ' : 'Not linked. '}
            {item.verificationNote}
          </T>
        </Card>
      ))}
      {items.length === 0 ? <T variant="muted">Nothing in this category yet.</T> : null}
    </Screen>
  );
}
