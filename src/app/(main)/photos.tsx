import { ProgressPhotos } from '@/ui/ProgressPhotos';
import { Screen } from '@/ui/ui';

export default function PhotosScreen() {
  return (
    <Screen eyebrow="You" title="Progress photos" intro="Private unless you choose to share one. Photos are not sent to Thumos.">
      <ProgressPhotos />
    </Screen>
  );
}
