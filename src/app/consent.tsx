import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { ConsentChoices } from '@/ui/ConsentChoices';
import { offerMessageNotifications } from '@/notifications/register';
import { Button, ErrorNote, Screen, T } from '@/ui/ui';

export default function Consent() {
  const repo = useRepository();
  const snap = useSnapshot();
  const profile = snap.profile;
  const [community, setCommunity] = useState(profile?.communityVisible ?? false);
  const [health, setHealth] = useState(profile?.consentHealth ?? false);
  const [ai, setAi] = useState(profile?.consentAi ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await repo.saveConsents({ communityVisible: community, consentHealth: health, consentAi: ai });
      if (community) void offerMessageNotifications(repo);
    } catch (err) {
      setError(shownError(err, 'Could not save.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen
      eyebrow="Consent"
      title="What may we keep?"
      intro="Your name, reasons, and interests are already saved. This record of what we may keep did not save last time."
    >
      <T>You already confirmed you are 18 or over.</T>
      <ConsentChoices
        community={community}
        health={health}
        ai={ai}
        onCommunity={setCommunity}
        onHealth={setHealth}
        onAi={setAi}
      />
      <ErrorNote>{error}</ErrorNote>
      <Button label="Save and continue" pending={pending} onPress={() => void save()} />
    </Screen>
  );
}
