import { ProfileTextSectionShare } from '@/ui/SectionShare';
import { PublicProfileCard } from '@/ui/PublicProfileCard';
import { Screen } from '@/ui/ui';

/** The same public profile People shows under “Your public profile”. */
export default function MyPublicProfile() {
  return (
    <Screen eyebrow="You">
      <ProfileTextSectionShare />
      <PublicProfileCard />
    </Screen>
  );
}
