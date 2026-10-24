import { useState } from 'react';

import { useRepository, useSnapshot } from '@/data';
import { CONSENT_INTRO, TERMS_REQUIRED } from '@/domain/consents';
import { shownError } from '@/domain/errors';
import { ConsentChoices } from '@/ui/ConsentChoices';
import { offerMessageNotifications } from '@/notifications/register';
import { Button, ErrorNote, Screen, T } from '@/ui/ui';

export default function Consent() {
  const repo = useRepository();
  const snap = useSnapshot();
  const profile = snap.profile;
  const [community, setCommunity] = useState(profile?.communityVisible ?? false);
  const [health, setHealth] = useState(false);
  const [ai, setAi] = useState(false);
  const [interim, setInterim] = useState(profile?.consentXaiInterim === true);
  const [messages, setMessages] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function changeInterim(value: boolean) {
    const previous = interim;
    setInterim(value);
    void repo.setInterimCoachOptIn(value).catch((err: unknown) => {
      setInterim(previous);
      setError(shownError(err, 'Could not save.'));
    });
  }

  async function save() {
    if (!terms) {
      setError(TERMS_REQUIRED);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await repo.saveConsents({
        communityVisible: community,
        consentHealth: health,
        consentAi: ai,
        messageNotifications: messages,
        termsAccepted: terms,
      });
      if (messages) void offerMessageNotifications(repo).catch((error: unknown) => console.error('message notifications', error));
    } catch (err) {
      setError(shownError(err, 'Could not save.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen eyebrow="Consent" intro={CONSENT_INTRO}>
      <T>Your name, reasons, and interests are already saved. Choose each item separately. They all start off.</T>
      <T>You already confirmed you are 18 or over. The terms tick is separate from the three choices below.</T>
      <ConsentChoices
        community={community}
        health={health}
        ai={ai}
        interim={interim}
        messages={messages}
        terms={terms}
        onCommunity={setCommunity}
        onHealth={setHealth}
        onAi={setAi}
        onInterim={changeInterim}
        onMessages={setMessages}
        onTerms={setTerms}
      />
      <ErrorNote>{error}</ErrorNote>
      <Button label="Save and continue" pending={pending} disabled={!terms} disabledReason={terms ? undefined : TERMS_REQUIRED} onPress={() => void save()} />
    </Screen>
  );
}
