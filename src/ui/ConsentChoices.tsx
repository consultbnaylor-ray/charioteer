import { Switch, View } from 'react-native';

import { formatUkLong, parseIsoDay } from '@/domain/dates';
import { PROFILE_PHOTO_WORDING } from '@/domain/profilePhotos';
import { CONSENT_VERSION } from '@/data/catalogue';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

/**
 * The community switch. Turning it on does not publish stats, photos, nutrition, or the wagon flag.
 * People and What I share reuse this wording.
 */
export const COMMUNITY_CONSENT_BODY =
  'Turning this on lets other members find you in People, see your name, interests and profile picture, and send you a request or a private message. Nothing else is shared. Stats, photos, nutrition, the wagon flag, and each other item stay off until you switch that item on separately. You can turn Community off at any time.';

/** A short version for the People tab, when this person has left Community off. */
export const COMMUNITY_PROMPT_BODY =
  'Other members cannot find you in People until Community is on. They would see your name and profile picture, and could send a request or a private message. Nothing else is shared until you switch it on.';

export function ConsentChoices({
  community,
  health,
  ai,
  messages,
  onCommunity,
  onHealth,
  onAi,
  onMessages,
  terms,
  onTerms,
}: {
  community: boolean;
  health: boolean;
  ai: boolean;
  messages: boolean;
  onCommunity: (value: boolean) => void;
  onHealth: (value: boolean) => void;
  onAi: (value: boolean) => void;
  onMessages: (value: boolean) => void;
  terms?: boolean;
  onTerms?: (value: boolean) => void;
}) {
  return (
    <View style={{ gap: 16 }}>
      <ConsentRow
        title="Community"
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
        body="This covers Thumos and personalised notifications via xAI. What you type, plus check-ins, reasons, and health summaries, is sent to xAI to write a reply. When health data is also on, that includes a short fitness summary (level, trends, weekly minutes, session mix, and recovery), not the raw samples. A few gratitude lines, the latest and the starred ones, are included when this coach is on. A reflection sends only that one line. Your vision statement and photo captions may be included when this coach is on. A gratitude line you have not switched on is never shown to the community. Gratitude photos are not sent. Vision board photos are not sent. Progress photos are not sent. This is not used for ads. Thumos is not a doctor. Turning this off stops every call that would send personal or health details to xAI."
        value={ai}
        onChange={onAi}
      />
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
