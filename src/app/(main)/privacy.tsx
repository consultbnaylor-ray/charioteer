import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { ConsentChoices } from '@/ui/ConsentChoices';
import { offerMessageNotifications } from '@/notifications/register';
import { Button, ErrorNote, Screen, T } from '@/ui/ui';

export default function PrivacyScreen() {
  const repo = useRepository();
  const snap = useSnapshot();
  const profile = snap.profile;
  const [community, setCommunity] = useState(profile?.communityVisible ?? false);
  const [health, setHealth] = useState(profile?.consentHealth ?? false);
  const [ai, setAi] = useState(profile?.consentAi ?? false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!profile) return null;

  return (
      <Screen eyebrow="You" title="Privacy & consent" intro="You can change these at any time. A diary line stays hidden until you switch it on. A photo on a line stays hidden until you switch that photo on, and is not sent to Thumos.">
      <ConsentChoices community={community} health={health} ai={ai} onCommunity={setCommunity} onHealth={setHealth} onAi={setAi} />
      <ErrorNote>{error}</ErrorNote>
      {message ? <T variant="muted">{message}</T> : null}
      <Button
        label="Save consent"
        pending={pending}
        onPress={() => {
          setPending(true);
          setError(null);
          setMessage(null);
          void repo.saveConsents({ communityVisible: community, consentHealth: health, consentAi: ai }).then(() => {
            setMessage('Saved.');
            if (community) void offerMessageNotifications(repo);
          }).catch((err: unknown) => setError(shownError(err, 'Could not save.'))).finally(() => setPending(false));
        }}
      />
    </Screen>
  );
}
