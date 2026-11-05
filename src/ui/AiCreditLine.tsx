import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useRepository } from '@/data';
import {
  aiCreditKindLine,
  aiCreditSummary,
  creditNudge,
  creditUpgradeLabel,
  creditsExhausted,
  EMPTY_AI_USAGE,
  type AiUsageCounts,
} from '@/domain/aiCredits';
import { entitlementActive } from '@/domain/subscription';
import { londonDayKey, londonMonthStart, tierForProduct, type UsageKind } from '@/domain/tierLimits';
import { useEntitlement } from '@/ui/useEntitlement';
import { Button, T } from '@/ui/ui';

/** Plan totals and what is left this month. Shown on Today, You, and beside credit-using buttons. */
export function AiCreditLine({ kind }: { kind?: UsageKind }) {
  const repo = useRepository();
  const router = useRouter();
  const entitlement = useEntitlement();
  const [usage, setUsage] = useState<AiUsageCounts>(EMPTY_AI_USAGE);
  useEffect(() => {
    const start = londonMonthStart(londonDayKey(new Date()));
    let live = true;
    void repo.loadAiUsageMonth(start).then((counts) => {
      if (live) setUsage(counts);
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [repo]);
  const row = entitlement.row;
  const tier = row && entitlementActive(row) ? tierForProduct(row.productId) : null;
  const line = kind ? aiCreditKindLine(tier, usage, kind) : aiCreditSummary(tier, usage);
  const nudge = creditNudge(tier, usage, kind);
  const upgrade = creditsExhausted(tier, usage, kind) ? creditUpgradeLabel(tier) : null;
  return (
    <View style={{ gap: 8 }}>
      <T variant="muted">{line}</T>
      {nudge ? <T variant="muted">{nudge}</T> : null}
      {upgrade ? (
        <Button
          label={upgrade}
          onPress={() => router.push('/paywall' as never)}
        />
      ) : null}
    </View>
  );
}
