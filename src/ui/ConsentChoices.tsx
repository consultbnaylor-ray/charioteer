import { Switch, View } from 'react-native';

import { formatUkLong, parseIsoDay } from '@/domain/dates';
import { PROFILE_PHOTO_WORDING } from '@/domain/profilePhotos';
import { CONSENT_VERSION } from '@/data/catalogue';
import { ScrollTarget } from '@/ui/ScrollTarget';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/** The community switch. It only controls the Community list. */
export const COMMUNITY_SWITCH_TITLE = 'Show me in the Community list';

/**
 * Turning it on does not publish stats, photos, nutrition, or the wagon flag.
 * People and What I share reuse this wording.
 * Search, buddies, and per-buddy shares keep working while this is off.
 */
export const COMMUNITY_CONSENT_BODY =
  'Turning this on lets other members find you in People, see your name, interests and profile picture, and send you a request or a private message. You can still search for other members, and keep or message buddies, while this is off. You choose what each buddy sees. Nothing else is shared. Stats, photos, nutrition, the wagon flag, and each other item stay off until you switch that item on separately. You can turn Community off at any time.';

/** A short version for the People tab, when this person has left the Community list. */
export const COMMUNITY_PROMPT_BODY =
  'Other members cannot find you in People until Community is on. You can still search for other members and keep buddies. They would see your name and profile picture, and could send a request or a private message. Nothing else is shared until you switch it on. You choose what each buddy sees.';

/**
 * First sentence of the AI coach consent. Marketing is out; xAI is only for the coach reply.
 * Profile, onboarding, the consent screen, and Privacy all use this through ConsentChoices.
 */
export const AI_COACH_CONSENT_LEAD =
  'Your data is never shared with any party for marketing purposes, and we only use personal information for the functionality of the app.';

export const AI_COACH_CONSENT_BODY =
  `${AI_COACH_CONSENT_LEAD} This covers Thumos and personalised notifications via xAI. What you type, plus check-ins, reasons, and health summaries, is sent to xAI to write a reply. When health data is also on, that includes a short fitness summary (level, trends, weekly minutes, session mix, and recovery), not the raw samples. A few gratitude lines, the latest and the starred ones, are included when this coach is on. A reflection sends only that one line. Your vision statement and photo captions may be included when this coach is on. A gratitude line you have not switched on is never shown to the community. Gratitude photos are not sent. Vision board photos are not sent. Progress photos are not sent. This is not used for ads. Thumos is not a doctor. Turning this off stops every call that would send personal or health details to xAI.`;

/**
 * Temporary second choice. It is not ticked when the AI coach is on.
 * Profile, onboarding, the consent screen, and Privacy all show it under that switch.
 */
export const INTERIM_COACH_TITLE = 'Temporary: continue before xAI confirms';

export const INTERIM_COACH_BODY =
  'This is a separate choice from the AI coach switch, and it starts off. xAI has not yet confirmed in writing that they will not save what Thumos sends. Turning this on lets coaching continue while that confirmation is still outstanding. What can be sent is: messages you type, a voice conversation, your name, your stage, sober or cutting-down figures, reasons, check-ins, interests, a pinned quote, a few gratitude lines, your vision statement and vision captions, nutrition targets, a target weight, and meal descriptions. A meal photo is sent only when you ask for a photo estimate. A health plan can include your food, body, and check-in figures. If health data is also on, a short fitness summary and Garmin daily totals can be included. Raw health samples, workout routes, gratitude photos, vision photos, and progress photos are not sent. xAI has not confirmed they will not keep this. You can turn this off at any time, and turning it off stops those sends.';

export function ConsentChoices({
  community,
  health,
  ai,
  interim,
  messages,
  onCommunity,
  onHealth,
  onAi,
  onInterim,
  onMessages,
  terms,
  onTerms,
}: {
  community: boolean;
  health: boolean;
  ai: boolean;
  /** Starts off. Never copied from the AI coach switch. */
  interim: boolean;
  messages: boolean;
  onCommunity: (value: boolean) => void;
  onHealth: (value: boolean) => void;
  onAi: (value: boolean) => void;
  onInterim: (value: boolean) => void;
  onMessages: (value: boolean) => void;
  terms?: boolean;
  onTerms?: (value: boolean) => void;
}) {
  return (
    <View style={{ gap: 16 }}>
      <ConsentRow
        title={COMMUNITY_SWITCH_TITLE}
        body={COMMUNITY_CONSENT_BODY}
        value={community}
        onChange={onCommunity}
      />
      <ConsentRow
        title="Health data"
        body="Health data processed in the app covers steps, sleep, heart rate, heart-rate variability, cardio fitness, walking heart rate, heart rate recovery, workouts, walking, cycling and swimming distance, and weight. They are special category data under UK GDPR. They are read on your iPhone and stored as daily totals so you can see a fitness summary. Quantica Labs Ltd is the controller. They are not used for ads. You can turn this off at any time, and you can export or delete them with your account."
        value={health}
        onChange={onHealth}
      />
      <ConsentRow
        title="AI coach and personalised notifications"
        body={AI_COACH_CONSENT_BODY}
        value={ai}
        onChange={onAi}
      />
      <ScrollTarget id="interim">
        <ConsentRow
          title={INTERIM_COACH_TITLE}
          body={INTERIM_COACH_BODY}
          value={interim}
          onChange={onInterim}
        />
      </ScrollTarget>
      <ConsentRow
        title="Message notifications"
        body="Message notifications start off. When you turn them on, a private message can alert this phone. The alert says New message on Charioteer and does not include the sender's name unless you turn that on separately. You can turn this off at any time."
        value={messages}
        onChange={onMessages}
      />
      {onTerms ? (
        <ConsentRow
          title="Terms"
          body="I accept the terms. This tick is separate from health data, the coach, and message notifications."
          value={Boolean(terms)}
          onChange={onTerms}
        />
      ) : null}
      <T>Progress photos stay private unless you share one. Anyone in the Charioteer community can then see that photo. Photos are not sent to Thumos. Gratitude photos stay private unless you switch that photo on. They are not sent to Thumos. Vision board photos always stay private. They are not sent to Thumos. A vision caption can be shown if you switch that item on. {PROFILE_PHOTO_WORDING}</T>
      <T variant="muted">This consent screen is plain language, not a solicitor’s privacy notice. Have it reviewed before a public launch. Version {formatUkLong(parseIsoDay(CONSENT_VERSION))}.</T>
    </View>
  );
}

function ConsentRow({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (value: boolean) => void }) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <T variant="title" style={{ fontSize: 20, flex: 1 }}>{title}</T>
        <Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ true: theme.colors.ink, false: theme.colors.line }} thumbColor={theme.colors.surface} />
      </View>
      <T variant="muted">{body}</T>
    </View>
  );
}
