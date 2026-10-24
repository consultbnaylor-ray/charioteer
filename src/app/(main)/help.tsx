import * as Linking from 'expo-linking';
import { Pressable, View } from 'react-native';

import { useSnapshot } from '@/data';
import { crisisHelplines } from '@/data/catalogue';
import { useAppTheme } from '@/ui/theme';
import { Card, Screen, T } from '@/ui/ui';

export default function HelpScreen() {
  const snap = useSnapshot();
  const theme = useAppTheme();
  const helplines = crisisHelplines(snap.resources);

  return (
    <Screen eyebrow="SOS" title="Help & crisis lines" intro="You do not have to be in the app to use these. They are free.">
      <Card style={{ borderColor: theme.colors.danger, borderLeftWidth: 3 }}>
        <T style={{ color: theme.colors.danger, fontFamily: theme.font.bodyStrong }}>If you need help now</T>
        {helplines.map((item) => (
          <View key={item.id} style={{ gap: 4 }}>
            <T variant="label" style={{ color: theme.colors.danger }}>{item.title}</T>
            <T>{item.detail}</T>
            {item.phone ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${item.phone?.replace(/\s/g, '')}`)}>
                <T style={{ color: theme.colors.danger, fontFamily: theme.font.bodyStrong }}>{item.phone}</T>
              </Pressable>
            ) : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
