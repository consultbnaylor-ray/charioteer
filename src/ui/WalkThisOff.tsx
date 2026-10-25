import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  OUTSIDE_CRISIS_LINE,
  OUTSIDE_SAFETY_LINE,
  ROUTE_SAFETY_LINE,
} from '@/domain/outdoorRoute';
import { MoreInfo } from '@/ui/MoreInfo';
import { Button, Card, T } from '@/ui/ui';

export function OutsideFacts() {
  return (
    <View style={{ gap: 8 }}>
      <T variant="muted">{OUTSIDE_SAFETY_LINE}</T>
      <T variant="muted">{OUTSIDE_CRISIS_LINE}</T>
      <T variant="muted">{ROUTE_SAFETY_LINE}</T>
    </View>
  );
}

/** A door to the craving walk. It does not ask for location on this card. */
export function WalkThisOff({ place }: { place: 'today' | 'breathe' }) {
  const router = useRouter();
  return (
    <Card>
      <T variant="label">Get Outside</T>
      <T variant="title">Walk this off</T>
      <T>A 10 to 20 minute walk.</T>
      <Button
        label="Walk this off"
        accessibilityLabel="Walk this off"
        onPress={() => router.push('/craving-walk' as never)}
      />
      {place === 'today' ? (
        <Button label="Open Get Outside" tone="quiet" onPress={() => router.push('/outside' as never)} />
      ) : null}
      <OutsideFacts />
      <MoreInfo about="walking this off">
        <T>This is a clock and a map for a walk. It is not a training prescription and not a crisis service.</T>
      </MoreInfo>
    </Card>
  );
}
