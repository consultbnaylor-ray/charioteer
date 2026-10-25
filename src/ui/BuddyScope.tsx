import { Switch, View } from 'react-native';

import {
  BUDDY_PRESETS,
  BUDDY_SCOPE_KEYS,
  buddyOnlyShareLine,
  scopeFromPreset,
  scopeSummary,
  type BuddyPresetId,
  type BuddyScope,
  type BuddyScopeKey,
} from '@/domain/buddies';
import { useAppTheme } from '@/ui/theme';
import { Card, Choice, T } from '@/ui/ui';

const SECTIONS: { key: Exclude<BuddyScopeKey, 'healthData'>; label: string }[] = [
  { key: 'meals', label: "Today's meal names" },
  { key: 'calories', label: 'Calories and macros' },
  { key: 'quality', label: 'Food quality' },
  { key: 'goal', label: 'Nutrition goal and progress' },
  { key: 'progress', label: 'Progress and streaks' },
  { key: 'checkIns', label: 'Check-ins and mood' },
  { key: 'gratitude', label: 'Gratitude lines' },
  { key: 'vision', label: 'Vision board words' },
  { key: 'healthPlan', label: 'Health Plan headline, focus, and ticks' },
];

function ScopeSwitch({ label, on, onChange }: { label: string; on: boolean; onChange: (next: boolean) => void }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <T style={{ flex: 1 }}>{label}</T>
      <Switch
        accessibilityLabel={label}
        value={on}
        onValueChange={onChange}
        trackColor={{ true: theme.colors.ink, false: theme.colors.line }}
        thumbColor={theme.colors.surface}
      />
    </View>
  );
}

/** Presets, section switches, and the health data switch. The summary is always on screen. */
export function BuddyScopeEditor({
  scope,
  onChange,
  heading,
  buddyName,
}: {
  scope: BuddyScope;
  onChange: (scope: BuddyScope) => void;
  heading: string;
  /** The one person these switches apply to. Blank for an invite link. */
  buddyName: string;
}) {
  const set = (key: BuddyScopeKey, next: boolean) => onChange({ ...scope, [key]: next });
  return (
    <View style={{ gap: 12 }}>
      <T>{buddyOnlyShareLine(buddyName)}</T>
      <T variant="muted">One switch per box. This is private to that person. It is separate from Community and from What I share, and it still works when Community is off.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {BUDDY_PRESETS.map((preset) => (
          <Choice
            key={preset.id}
            label={preset.label}
            selected={BUDDY_SCOPE_KEYS.every((key) => key === 'healthData' || scope[key] === scopeFromPreset(preset.id)[key])}
            onPress={() => onChange(scopeFromPreset(preset.id as BuddyPresetId, scope.healthData))}
          />
        ))}
      </View>
      <Card>
        {SECTIONS.map((section) => (
          <ScopeSwitch key={section.key} label={section.label} on={scope[section.key]} onChange={(next) => set(section.key, next)} />
        ))}
      </Card>
      <Card>
        <T variant="muted">Off unless you turn it on. Weight, body composition, Apple Health readings, and health flags.</T>
        <ScopeSwitch label="Include health data" on={scope.healthData} onChange={(next) => set('healthData', next)} />
      </Card>
      <Card>
        <T variant="label">{heading}</T>
        {scopeSummary(scope).map((line) => <T key={line}>{line}</T>)}
        <T variant="muted">They can reply only by private message. Either of you can stop this at any time.</T>
      </Card>
    </View>
  );
}
