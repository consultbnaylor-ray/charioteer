import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { ONLY_CHOSEN_NOTE, SHARED_PHOTOS_LABEL } from '@/domain/sharedPhotos';
import { SharedPhotos } from '@/ui/SharedPhotos';
import { Screen } from '@/ui/ui';

export default function SharedPhotosScreen() {
  useFocusEffect(useCallback(() => undefined, []));
  return (
    <Screen eyebrow="Buddies" title={SHARED_PHOTOS_LABEL} intro={ONLY_CHOSEN_NOTE}>
      <SharedPhotos />
    </Screen>
  );
}
