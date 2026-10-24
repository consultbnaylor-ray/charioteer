import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import {
  GARMIN_CONNECT_SETTINGS_URL,
  GARMIN_NOT_SENDING,
  GARMIN_PERMISSIONS_ALLOW,
  GARMIN_PERMISSIONS_FIX,
  GARMIN_PERMISSIONS_NEED,
  GARMIN_PERMISSIONS_OK,
  GARMIN_PERMISSIONS_SETTINGS,
  garminPermissionOverlay,
  garminPermissionsAreOk,
  garminRefreshWasRefused,
  subscribeGarminPermission,
} from '@/domain/garminPermission';
import { PlanTick } from '@/ui/PlanTick';
import { useAppTheme } from '@/ui/theme';
import { useGarminConnect } from '@/ui/useGarminConnect';
import { Button, T } from '@/ui/ui';

/** Obvious repair card. Shown on the Garmin card and under a refused refresh. */
export function GarminPermissionNotice({ force = false }: { force?: boolean }) {
  const theme = useAppTheme();
  const { connected, needsPermissions, missingPermissions, pending, fixPermissions } = useGarminConnect();
  const [refused, setRefused] = useState(garminRefreshWasRefused);
  const [ok, setOk] = useState(garminPermissionsAreOk);
  const [overlay, setOverlay] = useState(garminPermissionOverlay);

  useEffect(() => subscribeGarminPermission(() => {
    setRefused(garminRefreshWasRefused());
    setOk(garminPermissionsAreOk());
    setOverlay(garminPermissionOverlay());
  }), []);

  const missing = missingPermissions.length > 0 ? missingPermissions : overlay.missing;
  const exportsMissing = force || refused || missing.length > 0 || overlay.needs;
  if (connected && ok && !exportsMissing) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PlanTick done />
        <T>{GARMIN_PERMISSIONS_OK}</T>
      </View>
    );
  }
  if (!connected || (!exportsMissing && !needsPermissions)) return null;

  return (
    <View style={{ gap: 8 }}>
      <T style={{ fontFamily: theme.font.bodyStrong }}>{GARMIN_NOT_SENDING}</T>
      <T>{GARMIN_PERMISSIONS_NEED}</T>
      <Button
        label={GARMIN_PERMISSIONS_FIX}
        pending={pending === 'connect'}
        disabled={pending != null}
        onPress={() => void fixPermissions()}
      />
      <T variant="muted">{GARMIN_PERMISSIONS_ALLOW}</T>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(GARMIN_CONNECT_SETTINGS_URL)}>
        <T style={{ textDecorationLine: 'underline' }}>{GARMIN_PERMISSIONS_SETTINGS}</T>
      </Pressable>
    </View>
  );
}
