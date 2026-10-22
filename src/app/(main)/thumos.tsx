import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useRepository, useSnapshot } from '@/data';
import type { ThumosMessage } from '@/data/types';
import { CHARIOTEER_STORY, CHARIOTEER_STORY_TITLE } from '@/domain/charioteerStory';
import { ALCOHOL_FACTS } from '@/domain/facts';
import { earnedMilestones } from '@/domain/milestones';
import { firstSafetyHit, pinnedSafetyNotices } from '@/domain/safety';
import { asUserFacing, shownError } from '@/domain/errors';
import { showsSoberRecord } from '@/domain/stage';
import { CHECK_CONNECTION, EDGE_STATE_LABEL, SIGN_IN_AGAIN, isThumosFallback, type EdgeSendState } from '@/domain/edgeRetry';
import { CRAVING_LINE, inferThumosMode, SCRIPTED_COACH_REPLY, THUMOS_INTRO, THUMOS_UNREACHABLE, OPENING_LINE, type ThumosMode } from '@/domain/thumos';
import { THUMOS_LINE_CAP, groupThumosByDay, messageNeedsMore, visibleThumos } from '@/domain/thumosThread';
import { formatClock, urgeRemainingSeconds } from '@/domain/urge';
import { clearUrge, restartUrge } from '@/features/urgeSession';
import { VOICE_COPY } from '@/domain/voice';
import { VOICE_ENABLED } from '@/domain/voiceFlag';
import { createVoiceRuntime, voiceStatusLabel, type VoiceRuntime } from '@/domain/voiceSession';
import { briefingFromSnapshot } from '@/voice/briefing';
import { VoiceCall } from '@/voice/call';
import { HELMET_ASPECT, HELMET_D, HELMET_VIEWBOX } from '@/ui/helmet';
import { markThumosIntroSeen, thumosIntroSeen } from '@/ui/thumosIntroMemory';
import { Button, Card, ErrorNote, Field, Screen, T, useScreenScroller } from '@/ui/ui';
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
  const [sendState, setSendState] = useState<EdgeSendState | null>(null);
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [liveReply, setLiveReply] = useState('');
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [supportLatch, setSupportLatch] = useState(sos);
  const [factOpen, setFactOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceRuntime | null>(null);
  const callRef = useRef<VoiceCall | null>(null);
  const voiceTicket = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [urgeStart, setUrgeStart] = useState<number | null>(null);
  const [threadVisit, setThreadVisit] = useState(0);
  const [keptSend, setKeptSend] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState<boolean | null>(null);
  const introTouched = useRef(false);

  useFocusEffect(useCallback(() => {
    setThreadVisit((current) => current + 1);
    setKeptSend(null);
    setUrgeStart(null);
    clearUrge();
    return () => {
      setUrgeStart(null);
      clearUrge();
    };
  }, []));

  useEffect(() => {
    if (!profile) return;
    void repo.ensureThumosGuide(sos ? 'craving' : 'opening').catch((err: unknown) => setError(shownError(err, 'Could not open the coach.')));
  }, [profile, repo, sos]);

  useEffect(() => {
    const userId = profile?.id;
    if (!userId) return;
    let live = true;
    void thumosIntroSeen(userId).then((seen) => {
      if (!live) return;
      if (!introTouched.current) setIntroOpen(!seen);
      if (!seen) void markThumosIntroSeen(userId);
    });
    return () => {
      live = false;
    };
  }, [profile?.id]);

  const latest = snap.checkIns[0];
  // Draft text is not a message. Craving words are read only after Send.
  const mode: ThumosMode = inferThumosMode({
    sos,
    hasHistory: snap.thumos.length > 0,
    latestCraving: latest?.craving,
    latestMood: latest?.mood,
  });
  const showSupport = sos || supportLatch || mode === 'support';

  useEffect(() => () => {
    voiceTicket.current += 1;
    void callRef.current?.end();
    clearUrge();
  }, []);

  useEffect(() => {
    if (urgeStart == null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [urgeStart]);

  if (!profile) return null;
  const thread = snap.thumos.filter((message) => !(message.role === 'guide' && message.content === CRAVING_LINE));
  const { visible, earlier } = visibleThumos(thread, keptSend);
  const activity = `${outgoing ?? ''}|${liveReply}|${pending ? 1 : 0}`;
  const pinToken = introOpen === null
    ? ''
    : introOpen
      ? (pending || outgoing || liveReply ? `open|${activity}` : '')
      : `${visible[visible.length - 1]?.id ?? ''}|${activity}`;
  const lastUser = [...snap.thumos].reverse().find((message) => message.role === 'user');
  const safety = firstSafetyHit([
    draft,
    outgoing ?? '',
    voice?.liveUser ?? '',
    voice?.userText ?? '',
    lastUser?.content ?? '',
  ]);
  const notices = pinnedSafetyNotices(safety);
  const remaining = urgeStart == null ? 600 : urgeRemainingSeconds(urgeStart, now);
  const fact = ALCOHOL_FACTS[0];

  async function send(text = draft) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setKeptSend(trimmed);
    const sentMode = inferThumosMode({
      sos,
      hasHistory: true,
      latestCraving: latest?.craving,
      latestMood: latest?.mood,
      userText: trimmed,
    });
    const support = sentMode === 'support';
    setSupportLatch(support);
    setPending(true);
    setSendState('sending');
    setUnreachable(null);
    setLiveReply('');
    setOutgoing(trimmed);
    setError(null);
    setDraft('');
    try {
      await repo.sendThumos(
        trimmed,
        support ? 'support' : sentMode === 'opening' ? 'steady' : sentMode,
        (next) => setLiveReply(next),
        (state) => setSendState(state),
      );
    } catch (err) {
      setKeptSend(null);
      setDraft(trimmed);
      const message = asUserFacing(err, 'thumos').message;
      if (message === SIGN_IN_AGAIN || message === CHECK_CONNECTION) setError(message);
      else if (isThumosFallback(message)) {
        const scriptedAt = message.indexOf(SCRIPTED_COACH_REPLY);
        setUnreachable(scriptedAt >= 0 ? message.slice(0, scriptedAt).trim() : message);
      } else setError(message);
    } finally {
      setPending(false);
      setSendState(null);
      setLiveReply('');
      setOutgoing(null);
    }
  }

  const inCall = Boolean(voice && voice.phase !== 'ended' && voice.phase !== 'error');

  async function startVoice() {
    if (!VOICE_ENABLED) return;
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
        greeting: mint.greeting && mint.greeting !== CRAVING_LINE ? mint.greeting : OPENING_LINE,
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
        : 'Thumos helps you stay sober, and can nudge you to move, eat, and sleep. It is not a doctor.'}
      banner={safetyBanner}
    >
      {showSupport ? (
        <Card style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.ink, borderWidth: 2 }}>
          <T variant="label">Urge timer</T>
          <T variant="hero">{formatClock(remaining)}</T>
          <T>Cravings rise, peak, and pass. Many people find the sharpest part eases within about 20 to 30 minutes. That is a guide, not a measurement.</T>
          {urgeStart != null && remaining === 0 ? <T>The ten minutes are up. How do you feel now?</T> : null}
          <Button
            label={urgeStart == null ? 'Start ten minutes' : 'Start the ten minutes again'}
            tone="quiet"
            onPress={() => { setUrgeStart(restartUrge()); setNow(Date.now()); }}
          />
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
      <View style={{ width: '100%', gap: 8 }}>
        <ThumosIntro
          open={introOpen === true}
          onToggle={() => {
            introTouched.current = true;
            setIntroOpen((value) => !value);
          }}
        />
        <ThumosTranscript
          key={threadVisit}
          messages={visible}
          earlier={earlier}
          pending={pending}
          outgoing={outgoing}
          liveReply={liveReply}
          statusLine={sendState ? EDGE_STATE_LABEL[sendState] : null}
        />
        {VOICE_ENABLED && inCall && voice ? (
          <Card style={{ borderColor: theme.colors.ink, borderWidth: 2 }}>
            <T variant="label">Voice</T>
            <T variant="display">{voiceStatusLabel(voice)}</T>
            {voice.liveUser ? <T>You: {voice.liveUser}</T> : null}
            {voice.liveAssistant ? <T>Thumos: {voice.liveAssistant}</T> : null}
            {voice.message && voice.phase !== 'error' ? <T variant="muted">{voice.message}</T> : null}
            {voice.detail ? <T variant="muted" style={{ width: '100%', flexShrink: 1 }}>{voice.detail}</T> : null}
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
            <Button label="Allow the coach" onPress={() => void repo.saveConsents({
              communityVisible: profile.communityVisible,
              consentHealth: profile.consentHealth,
              consentAi: true,
              messageNotifications: profile.messageNotifications,
              termsAccepted: true,
            }).catch((err: unknown) => setError(shownError(err, 'Could not save.')))} />
          </Card>
        ) : (
          <Field label="Message" value={draft} onChangeText={setDraft} multiline placeholder="Say it in your own words" />
        )}
        {unreachable ? (
          <Card>
            <T>{unreachable ?? THUMOS_UNREACHABLE}</T>
            <T>{SCRIPTED_COACH_REPLY}</T>
            <Button label="Try again" onPress={() => void send()} />
          </Card>
        ) : null}
        <ErrorNote>{error || (VOICE_ENABLED && voice?.phase === 'error' ? voice.message : null)}</ErrorNote>
        {VOICE_ENABLED && !error && voice?.phase === 'error' && voice.detail ? <T variant="muted" style={{ width: '100%', flexShrink: 1 }}>{voice.detail}</T> : null}
        {VOICE_ENABLED && inCall ? null : VOICE_ENABLED ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Send" pending={pending} disabled={!profile.consentAi} disabledReason={profile.consentAi ? undefined : 'Allow the coach before sending.'} onPress={() => void send()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Voice" disabled={!profile.consentAi || pending} disabledReason={profile.consentAi ? undefined : 'Allow the coach before a voice call.'} onPress={() => void startVoice()} />
            </View>
          </View>
        ) : (
          <Button label="Send" pending={pending} disabled={!profile.consentAi} disabledReason={profile.consentAi ? undefined : 'Allow the coach before sending.'} onPress={() => void send()} />
        )}
        <PinLatest token={pinToken} />
      </View>
      {showsSoberRecord(profile.stage) ? <T variant="muted">Milestones in view: {(profile.sobrietyStartedAt ? earnedMilestones(new Date(profile.sobrietyStartedAt), new Date()) : []).map((item) => item.badge).join(', ') || 'none yet'}.</T> : null}
      <SoulStory />
    </Screen>
  );
}

const INTRO_LINE = 'Thumos is your sober and fitness coach, tap to read more';

function ThumosIntro({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  // 348 is the collapsed sentence at 15px Barlow, so it stays one line on a narrow phone.
  const introSize = Math.min(15 * theme.scale, Math.max(0, width - 68) / (348 / 15));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? 'Thumos, sober and fitness coach' : INTRO_LINE}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      onPress={onToggle}
      style={{
        minHeight: 44,
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      {open ? (
        <T style={{ fontSize: 15 * theme.scale, lineHeight: 20 * theme.scale }}>{THUMOS_INTRO}</T>
      ) : (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{ fontFamily: theme.font.body, fontSize: introSize, lineHeight: Math.round(introSize * 1.25), color: theme.colors.ink }}
        >
          {INTRO_LINE}
        </Text>
      )}
    </Pressable>
  );
}

function Bubble({ mine, text }: { mine: boolean; text: string }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const long = messageNeedsMore(text);
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        backgroundColor: mine ? theme.colors.emphasisSoft : theme.colors.surface,
        borderColor: theme.colors.line,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        paddingVertical: 6,
        paddingHorizontal: 10,
      }}
    >
      <Text
        numberOfLines={open || !long ? undefined : THUMOS_LINE_CAP}
        style={{ fontFamily: theme.font.body, fontSize: 15 * theme.scale, lineHeight: 20 * theme.scale, color: theme.colors.ink }}
      >
        {text}
      </Text>
      {long && !open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          onPress={() => setOpen(true)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T variant="muted">More</T>
        </Pressable>
      ) : null}
    </View>
  );
}

function EarlierDay({ heading, messages }: { heading: string; messages: ThumosMessage[] }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ width: '100%', gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={heading}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong }}>{heading}</T>
      </Pressable>
      {open ? messages.map((message) => (
        <Bubble key={message.id} mine={message.role === 'user'} text={message.content} />
      )) : null}
    </View>
  );
}

function ThumosTranscript({
  messages,
  earlier,
  pending,
  outgoing,
  liveReply,
  statusLine,
}: {
  messages: ThumosMessage[];
  earlier: ThumosMessage[];
  pending: boolean;
  outgoing: string | null;
  liveReply: string;
  statusLine?: string | null;
}) {
  const [earlierOpen, setEarlierOpen] = useState(false);
  const days = groupThumosByDay(earlier);
  const earlierLabel = `Show earlier messages (${earlier.length})`;
  return (
    <View style={{ width: '100%', gap: 4 }}>
      {earlier.length > 0 && !earlierOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={earlierLabel}
          onPress={() => setEarlierOpen(true)}
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <T variant="muted">{earlierLabel}</T>
        </Pressable>
      ) : null}
      {earlierOpen ? days.map((day) => <EarlierDay key={day.day} heading={day.heading} messages={day.messages} />) : null}
      {messages.map((message) => (
        <Bubble key={message.id} mine={message.role === 'user'} text={message.content} />
      ))}
      {pending && outgoing && !messages.some((message) => message.role === 'user' && message.content === outgoing) ? <Bubble mine text={outgoing} /> : null}
      {pending && !messages.some((message) => message.role !== 'user' && message.content === liveReply) ? <Bubble mine={false} text={liveReply || statusLine || 'Waiting for Thumos…'} /> : null}
    </View>
  );
}

function PinLatest({ token }: { token: string }) {
  const handle = useScreenScroller();
  const marker = useRef<View>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const pin = () => {
      if (cancelled) return;
      if (Platform.OS === 'web') {
        if (typeof document === 'undefined') return;
        document.getElementById('thumos-latest')?.scrollIntoView({ block: 'end' });
        return;
      }
      const markerView = marker.current;
      const inner = handle?.current.innerRef.current;
      const scroller = handle?.current.scrollRef.current;
      if (!markerView || !inner || !scroller) return;
      markerView.measureLayout(
        inner,
        (_x, y, _width, height) => {
          const viewport = handle?.current.height ?? 0;
          const target = viewport > 0 ? y + height - viewport + 8 : y;
          scroller.scrollTo({ y: Math.max(0, target), animated: false });
        },
        () => {},
      );
    };
    const frame = requestAnimationFrame(() => {
      pin();
      requestAnimationFrame(pin);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [token, handle]);
  return <View ref={marker} nativeID="thumos-latest" collapsable={false} style={{ height: 1, width: '100%' }} />;
}

function SoulStory() {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [before, after] = CHARIOTEER_STORY.split('Phaedrus');
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.getElementById('charioteer-story')?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  return (
    <Card>
      <Pressable
        nativeID="charioteer-story"
        accessibilityRole="button"
        accessibilityLabel={CHARIOTEER_STORY_TITLE}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <T variant="title" style={{ flex: 1 }}>{CHARIOTEER_STORY_TITLE}</T>
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: 28, height: 28, transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        >
          <Svg width={28} height={28} viewBox="0 0 24 24">
            <Path d="M5 8.5l7 7 7-7" stroke={theme.colors.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </Pressable>
      {open ? (
        <View style={{ gap: 14, paddingTop: 8 }}>
          <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center', opacity: 0.15 }}>
            <Svg width={96} height={96 / HELMET_ASPECT} viewBox={HELMET_VIEWBOX}>
              <Path d={HELMET_D} fill={theme.colors.ink} />
            </Svg>
          </View>
          <T style={{ lineHeight: 28 * theme.scale }}>
            {before}
            <Text style={{ fontFamily: theme.font.bodyItalic }}>Phaedrus</Text>
            {after}
          </T>
        </View>
      ) : null}
    </Card>
  );
}
