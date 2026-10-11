import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { ALCOHOL_FACTS } from '@/domain/facts';
import { earnedMilestones } from '@/domain/milestones';
import { firstSafetyHit, pinnedSafetyNotices } from '@/domain/safety';
import { asUserFacing, shownError } from '@/domain/errors';
import { showsSoberRecord } from '@/domain/stage';
import { inferThumosMode, type ThumosMode } from '@/domain/thumos';
import { formatClock, urgeRemainingSeconds } from '@/domain/urge';
import { ensureUrge, restartUrge } from '@/features/urgeSession';
import { VOICE_COPY } from '@/domain/voice';
import { createVoiceRuntime, voiceStatusLabel, type VoiceRuntime } from '@/domain/voiceSession';
import { briefingFromSnapshot } from '@/voice/briefing';
import { VoiceCall } from '@/voice/call';
import { Button, Card, ErrorNote, Field, Screen, T } from '@/ui/ui';
import { useAppTheme } from '@/ui/theme';

export default function Thumos() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const sos = params.mode === 'craving';
  const snap = useSnapshot();
  const repo = useRepository();
  const router = useRouter();
  const theme = useAppTheme();
  const profile = snap.profile;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [liveReply, setLiveReply] = useState('');
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [supportLatch, setSupportLatch] = useState(sos);
  const [factOpen, setFactOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceRuntime | null>(null);
  const callRef = useRef<VoiceCall | null>(null);
  const voiceTicket = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [urgeStart, setUrgeStart] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    void repo.ensureThumosGuide(sos ? 'craving' : 'opening').catch((err: unknown) => setError(shownError(err, 'Could not open the coach.')));
  }, [profile, repo, sos]);

  const latest = snap.checkIns[0];
  const mode: ThumosMode = inferThumosMode({
    sos,
    hasHistory: snap.thumos.length > 0,
    latestCraving: latest?.craving,
    latestMood: latest?.mood,
    userText: draft,
  });
  const showSupport = sos || supportLatch || mode === 'support';

  useEffect(() => () => {
    voiceTicket.current += 1;
    void callRef.current?.end();
  }, []);

  useEffect(() => {
    if (!showSupport) return;
    setUrgeStart((current) => current ?? ensureUrge());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [showSupport]);

  if (!profile) return null;
  const lastUser = [...snap.thumos].reverse().find((message) => message.role === 'user');
  const safety = firstSafetyHit([
    draft,
    outgoing ?? '',
    voice?.liveUser ?? '',
    voice?.userText ?? '',
    lastUser?.content ?? '',
  ]);
  const notices = pinnedSafetyNotices(safety);
  const remaining = urgeStart == null ? 0 : urgeRemainingSeconds(urgeStart, now);
  const fact = ALCOHOL_FACTS[0];

  async function send(text = draft) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const support = sos || mode === 'support' || inferThumosMode({ sos, hasHistory: true, userText: trimmed }) === 'support';
    setSupportLatch(support);
    setPending(true);
    setLiveReply('');
    setOutgoing(trimmed);
    setError(null);
    setDraft('');
    try {
      await repo.sendThumos(trimmed, support ? 'support' : mode === 'opening' ? 'steady' : mode, (next) => setLiveReply(next));
    } catch (err) {
      setDraft(trimmed);
      setError(asUserFacing(err, 'thumos').message);
    } finally {
      setPending(false);
      setLiveReply('');
      setOutgoing(null);
    }
  }

  const inCall = Boolean(voice && voice.phase !== 'ended' && voice.phase !== 'error');

  async function startVoice() {
    if (!profile?.consentAi || callRef.current) return;
    const ticket = voiceTicket.current + 1;
    voiceTicket.current = ticket;
    setError(null);
    const requested = showSupport ? 'support' as const : mode === 'opening' ? 'steady' as const : mode;
    const fallback = briefingFromSnapshot(snap, requested);
    if (!fallback) return;
    setVoice(createVoiceRuntime());
    try {
      const mint = await repo.mintVoiceToken(requested);
      if (ticket !== voiceTicket.current) return;
      if (!mint.ok) {
        setVoice(null);
        setError(mint.message);
        return;
      }
      const briefing = {
        instructions: mint.instructions ?? fallback.instructions,
        crisisInstructions: mint.crisisInstructions ?? fallback.crisisInstructions,
        history: mint.history.length ? mint.history : fallback.history,
        mode: mint.mode ?? fallback.mode,
        greeting: mint.greeting ?? fallback.greeting,
      };
      const call = new VoiceCall({
        token: mint.token,
        briefing,
        saveTurn: (turn) => repo.saveVoiceTurn({ ...turn, mode: briefing.mode }),
        onChange: (next) => {
          setVoice(next);
          if (next.phase === 'error' || next.phase === 'ended') callRef.current = null;
        },
      });
      if (ticket !== voiceTicket.current) return;
      callRef.current = call;
      await call.start();
    } catch (err) {
      if (ticket !== voiceTicket.current) return;
      console.warn('[voice] start failed', err);
      callRef.current = null;
      setError(null);
      setVoice((current) => ({
        ...(current ?? createVoiceRuntime()),
        phase: 'error',
        message: VOICE_COPY.failed,
        detail: current?.detail ?? null,
      }));
    }
  }

  async function endVoice() {
    voiceTicket.current += 1;
    const call = callRef.current;
    callRef.current = null;
    await call?.end();
    setVoice((current) => (current ? { ...current, phase: 'ended' } : current));
  }

  const safetyBanner = notices.length ? (
    <Card style={{ backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger, borderLeftWidth: 3 }}>
      <T variant="label" style={{ color: theme.colors.danger }}>Safety</T>
      {notices.map((notice) => (
        <T key={notice.slice(0, 24)} style={{ color: theme.colors.danger }}>{notice}</T>
      ))}
    </Card>
  ) : null;

  return (
    <Screen
      eyebrow="Thumos"
      title={sos ? 'Craving support' : 'How are you feeling?'}
      intro={snap.mode === 'demo'
        ? 'Earlier replies in the sample are stored examples, so you can see the shape of a conversation. A new message explains, clearly, when the live coach is not connected.'
        : 'Thumos helps you stay sober and get healthier. It is not a doctor.'}
      banner={safetyBanner}
    >
      {showSupport ? (
        <Card style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.ink, borderWidth: 2 }}>
          <T variant="label">Urge timer</T>
          <T variant="hero">{formatClock(remaining)}</T>
          <T>Cravings rise, peak, and pass. Many people find the sharpest part eases within about 20 to 30 minutes. That is a guide, not a measurement.</T>
          {remaining === 0 ? <T>The ten minutes are up. How do you feel now?</T> : null}
          <Button label="Start the ten minutes again" tone="quiet" onPress={() => { setUrgeStart(restartUrge()); setNow(Date.now()); }} />
          <Button label="Breathe" onPress={() => router.push('/breathe?exercise=sigh' as never)} />
          <T variant="label">What happens if you drink?</T>
          <T>Ask it plainly: what do you think will happen, and is it worth it? A walk, jog, or run can carry you through the peak if you are able.</T>
          <T variant="label">Your reasons</T>
          {snap.reasons.length === 0 ? <T variant="muted">You have not written any yet.</T> : snap.reasons.map((reason) => <T key={reason.id}>{reason.body}</T>)}
          <Button label={factOpen ? 'Hide the sourced fact' : 'Show one sourced fact'} tone="quiet" onPress={() => setFactOpen((value) => !value)} />
          {factOpen ? (
            <View>
              <T>{fact.text}</T>
              <T variant="muted">{fact.published}</T>
            </View>
          ) : null}
        </Card>
      ) : null}
      {snap.thumos.map((message) => (
        <Card key={message.id} style={{ backgroundColor: message.role === 'user' ? theme.colors.emphasisSoft : theme.colors.surface }}>
          <T variant="label">{message.role === 'user' ? 'You' : message.role === 'offline' ? 'Charioteer' : 'Thumos'}</T>
          <T>{message.content}</T>
        </Card>
      ))}
      {pending && outgoing ? (
        <Card style={{ backgroundColor: theme.colors.emphasisSoft }}>
          <T variant="label">You</T>
          <T>{outgoing}</T>
        </Card>
      ) : null}
      {pending ? (
        <Card>
          <T variant="label">Thumos</T>
          <T>{liveReply || 'Thumos is thinking'}</T>
        </Card>
      ) : null}
      {inCall && voice ? (
        <Card style={{ borderColor: theme.colors.ink, borderWidth: 2 }}>
          <T variant="label">Voice</T>
          <T variant="display">{voiceStatusLabel(voice)}</T>
          {voice.liveUser ? <T>You: {voice.liveUser}</T> : null}
          {voice.liveAssistant ? <T>Thumos: {voice.liveAssistant}</T> : null}
          {voice.message && voice.phase !== 'error' ? <T variant="muted">{voice.message}</T> : null}
          {voice.detail ? <T variant="muted">{voice.detail}</T> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={voice.muted ? 'Unmute' : 'Mute'}
                tone="quiet"
                onPress={() => callRef.current?.mute()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="End call" tone="quiet" onPress={() => void endVoice()} />
            </View>
          </View>
        </Card>
      ) : !profile.consentAi ? (
        <Card>
          <T>Thumos stays quiet until you agree that messages can be sent to the coach.</T>
          <Button label="Allow the coach" onPress={() => void repo.updateProfile({ consentAi: true }).catch((err: unknown) => setError(shownError(err, 'Could not save.')))} />
        </Card>
      ) : (
        <Field label="Message" value={draft} onChangeText={setDraft} multiline placeholder="Say it in your own words" />
      )}
      <ErrorNote>{error || (voice?.phase === 'error' ? voice.message : null)}</ErrorNote>
      {!error && voice?.phase === 'error' && voice.detail ? <T variant="muted">{voice.detail}</T> : null}
      {inCall ? null : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Send" pending={pending} disabled={!profile.consentAi} onPress={() => void send()} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Voice" disabled={!profile.consentAi || pending} onPress={() => void startVoice()} />
          </View>
        </View>
      )}
      {showsSoberRecord(profile.stage) ? <T variant="muted">Milestones in view: {(profile.sobrietyStartedAt ? earnedMilestones(new Date(profile.sobrietyStartedAt), new Date()) : []).map((item) => item.badge).join(', ') || 'none yet'}.</T> : null}
    </Screen>
  );
}
