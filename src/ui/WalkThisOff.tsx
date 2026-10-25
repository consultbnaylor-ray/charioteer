import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  OUTSIDE_CRISIS_LINE,
  OUTSIDE_SAFETY_LINE,
  PATH_LINE,
  ROUTE_SAFETY_LINE,
} from '@/domain/outdoorRoute';
import { MoreInfo } from '@/ui/MoreInfo';
import { Button, Card, T } from '@/ui/ui';

/** A door to the craving walk. It does not ask for location on this card. */
export function WalkThisOff({ place }: { place: 'today' | 'breathe' }) {
  const router = useRouter();
  return (
    <Card>
      <T variant="label">Get Outside</T>
      <T variant="title">Walk this off</T>
      <T>A short loop from where you are, drawn on this phone.</T>
      <T>{OUTSIDE_SAFETY_LINE}</T>
      <T>{OUTSIDE_CRISIS_LINE}</T>
      <T>{ROUTE_SAFETY_LINE}</T>
      <Button
        label="Walk this off"
        accessibilityLabel="Walk this off"
        onPress={() => router.push('/craving-walk' as never)}
      />
      {place === 'today' ? (
        <Button label="Open Get Outside" tone="quiet" onPress={() => router.push('/outside' as never)} />
      ) : null}
      <MoreInfo about="walking this off">
        <T>{PATH_LINE}</T>
        <T>This is a clock and a map for a walk. It is not a training prescription and not a crisis service.</T>
      </MoreInfo>
    </Card>
  );
}

export function OutsideFacts() {
  return (
    <View style={{ gap: 8 }}>
      <T>{OUTSIDE_SAFETY_LINE}</T>
      <T>{OUTSIDE_CRISIS_LINE}</T>
      <T>{ROUTE_SAFETY_LINE}</T>
    </View>
  );
}
