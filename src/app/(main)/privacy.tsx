import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { ConsentChoices } from '@/ui/ConsentChoices';
import { offerMessageNotifications } from '@/notifications/register';
import { usePendingPress } from '@/ui/pendingAction';
import { Button, ErrorNote, Screen, T } from '@/ui/ui';

export default function PrivacyScreen() {
  const repo = useRepository();
  const snap = useSnapshot();
  const profile = snap.profile;
  const [community, setCommunity] = useState(profile?.communityVisible ?? false);
  const [health, setHealth] = useState(profile?.consentHealth ?? false);
  const [ai, setAi] = useState(profile?.consentAi ?? false);
  const [messages, setMessages] = useState(profile?.messageNotifications ?? false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { run, isPending } = usePendingPress();
  if (!profile) return null;

  return (
      <Screen eyebrow="You" title="Privacy & consent" intro="You can change these at any time. A diary line stays hidden until you switch it on. A photo on a line stays hidden until you switch that photo on, and is not sent to Thumos.">
      <ConsentChoices
        community={community}
        health={health}
        ai={ai}
        messages={messages}
        onCommunity={setCommunity}
        onHealth={setHealth}
        onAi={setAi}
        onMessages={setMessages}
      />
      <ErrorNote>{error}</ErrorNote>
      {message ? <T variant="muted">{message}</T> : null}
      <Button
        label="Save consent"
        pending={isPending('save')}
        onPress={() => {
          setError(null);
          setMessage(null);
          run('save', () => repo.saveConsents({
            communityVisible: community,
            consentHealth: health,
            consentAi: ai,
            messageNotifications: messages,
            termsAccepted: true,
          }).then(() => {
            setMessage('Saved.');
            if (messages) void offerMessageNotifications(repo).catch((error: unknown) => console.error('message notifications', error));
          }).catch((err: unknown) => setError(shownError(err, 'Could not save.'))));
        }}
      />
    </Screen>
  );
}
