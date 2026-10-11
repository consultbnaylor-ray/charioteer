import { Switch, View } from 'react-native';

import { formatUkLong, parseIsoDay } from '@/domain/dates';
import { CONSENT_VERSION } from '@/data/catalogue';
import { useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

export function ConsentChoices({
  community,
  health,
  ai,
  onCommunity,
  onHealth,
  onAi,
}: {
  community: boolean;
  health: boolean;
  ai: boolean;
  onCommunity: (value: boolean) => void;
  onHealth: (value: boolean) => void;
  onAi: (value: boolean) => void;
}) {
  return (
    <View style={{ gap: 16 }}>
      <ConsentRow
        title="Community"
        body="Other adults can see your name, town or area, and interests. They cannot see your reasons, check-ins, money, units, or health. Your gratitude diary, including any photos on a line, is never shown to other people. A progress photo stays hidden unless you choose Share with community on that photo."
        value={community}
        onChange={onCommunity}
      />
      <ConsentRow
        title="Health data"
        body="Steps, sleep, heart rate, heart-rate variability, workouts, and weight are special category data under UK GDPR. Stored so you and Thumos can see trends. Quantica Labs Ltd is the controller. You can export or delete them with your account."
        value={health}
        onChange={onHealth}
      />
      <ConsentRow
        title="Thumos, the coach"
        body="What you type, plus check-ins, reasons, and health summaries, is sent to xAI to write a reply. A few gratitude lines, the latest and the starred ones, are included when this coach is on. A reflection sends only that one line. The gratitude diary stays private and is never shown to the community. Gratitude photos are not sent. Progress photos are not sent. Thumos is not a doctor."
        value={ai}
        onChange={onAi}
      />
      <T>Progress photos stay private unless you share one. Anyone in the Charioteer community can then see that photo. Photos are not sent to Thumos. Gratitude photos always stay private. They are not shared with the community and are not sent to Thumos.</T>
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
