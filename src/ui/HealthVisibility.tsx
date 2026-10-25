import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  healthVisibilityLine,
  unaskedHealthTypes,
  HEALTH_ASK_AGAIN,
  HEALTH_CHECK_AGAIN,
  HEALTH_VISIBILITY_NOTE,
  HEALTH_VISIBILITY_TITLE,
  type HealthVisibilityReport,
} from '@/domain/healthVisibility';
import { APPLE_HEALTH_UNAVAILABLE, APPLE_HEALTH_WEB, type AppleHealthTurnOn } from '@/health/connection';
import { useAppTheme } from '@/ui/theme';
import { textMentionsWeight, UpdateWeightLink } from '@/ui/UpdateWeightLink';
import { Button, Card, T } from '@/ui/ui';

/** Collapsed until opened. iOS hides read permission, so the lines stay with asked and samples. */
export function HealthVisibility({
  report,
  pending,
  request = 0,
  onOpen,
  onCheck,
  onAsk,
}: {
  report: HealthVisibilityReport | null;
  pending: boolean;
  /** Each increase opens the list. The row starts closed. */
  request?: number;
  onOpen: () => void;
  onCheck: () => void;
  onAsk: (types: readonly string[]) => Promise<AppleHealthTurnOn | 'consent'>;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const seen = useRef(0);
  const unasked = report?.kind === 'ready' ? unaskedHealthTypes(report.rows) : [];
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (request === seen.current) return;
    seen.current = request;
    if (request < 1) return;
    setOpen(true);
    onOpen();
  }, [request, onOpen]);

  function toggle() {
    setOpen((value) => {
      if (!value) onOpen();
      return !value;
    });
  }

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HEALTH_VISIBILITY_TITLE}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <T style={{ fontFamily: theme.font.bodyStrong, flex: 1 }}>{HEALTH_VISIBILITY_TITLE}</T>
        <T variant="muted">{open ? 'Hide' : 'Show'}</T>
      </Pressable>
      {open ? (
        <View style={{ gap: 8 }}>
          <T variant="muted">{HEALTH_VISIBILITY_NOTE}</T>
          {report == null || pending ? <T>Checking...</T> : null}
          {report?.kind === 'web' ? <T>{APPLE_HEALTH_WEB}</T> : null}
          {report?.kind === 'unavailable' ? <T>{APPLE_HEALTH_UNAVAILABLE}</T> : null}
          {report?.kind === 'ready' ? report.rows.map((row) => (
            <T key={row.type}>{healthVisibilityLine(row)}</T>
          )) : null}
          {report?.kind === 'ready' && report.rows.some((row) => textMentionsWeight(healthVisibilityLine(row)) || textMentionsWeight(row.title)) ? (
            <UpdateWeightLink />
          ) : null}
          <Button
            label={HEALTH_CHECK_AGAIN}
            pending={pending}
            pendingLabel="Checking..."
            onPress={onCheck}
          />
          {unasked.length ? (
            <Button
              label={HEALTH_ASK_AGAIN}
              pending={asking}
              pendingLabel="Asking..."
              onPress={() => {
                setAsking(true);
                void onAsk(unasked).finally(() => setAsking(false));
              }}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
