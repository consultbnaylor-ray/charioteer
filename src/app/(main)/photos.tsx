import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useRepository } from '@/data';
import { ProgressPhotos } from '@/ui/ProgressPhotos';
import { Screen } from '@/ui/ui';

export default function PhotosScreen() {
  const repo = useRepository();
  // Owner photo links expire while the tab stays mounted, so load them again each time this screen opens.
  useFocusEffect(
    useCallback(() => {
      void repo.reload();
    }, [repo]),
  );
  return (
    <Screen eyebrow="You" title="Progress photos" intro="Private unless you choose to share one. Photos are not sent to Thumos.">
      <ProgressPhotos />
    </Screen>
  );
}
