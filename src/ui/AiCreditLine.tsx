import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useRepository } from '@/data';
import {
  aiCreditStatusLine,
  creditNudge,
  creditUpgradeLabel,
  creditsExhausted,
  EMPTY_AI_USAGE,
  type AiUsageCounts,
} from '@/domain/aiCredits';
import { FETCH_TIMEOUT_MS } from '@/domain/retryFetch';
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
  const [usageFailed, setUsageFailed] = useState(false);
  const [usageAttempt, setUsageAttempt] = useState(0);
  useEffect(() => {
    const start = londonMonthStart(londonDayKey(new Date()));
    let live = true;
    setUsageFailed(false);
    const timer = setTimeout(() => {
      if (live) setUsageFailed(true);
    }, FETCH_TIMEOUT_MS);
    void repo.loadAiUsageMonth(start).then((counts) => {
      if (!live) return;
      clearTimeout(timer);
      setUsage(counts);
      setUsageFailed(false);
    }).catch(() => {
      if (!live) return;
      clearTimeout(timer);
      setUsageFailed(true);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [repo, usageAttempt]);
  const row = entitlement.row;
  const tier = entitlement.comp?.tier ?? (row && entitlementActive(row) ? tierForProduct(row.productId) : null);
  const checking = entitlement.loading || entitlement.compLoading;
  const planFailed = entitlement.failed || entitlement.compFailed;
  const line = aiCreditStatusLine({ tier, usage, kind, checking, planFailed, usageFailed });
  const lookupProblem = (!tier && (checking || planFailed)) || usageFailed;
  const nudge = lookupProblem || entitlement.comp ? null : creditNudge(tier, usage, kind);
  const upgrade = lookupProblem || entitlement.compLoading || entitlement.comp ? null : (creditsExhausted(tier, usage, kind) ? creditUpgradeLabel(tier) : null);
  const retry = !checking && (planFailed || usageFailed);
  return (
    <View style={{ gap: 8 }}>
      <T variant="muted">{line}</T>
      {nudge ? <T variant="muted">{nudge}</T> : null}
      {retry ? (
        <Button
          label="Try again"
          tone="quiet"
          onPress={() => {
            setUsageAttempt((current) => current + 1);
            void entitlement.refresh();
          }}
        />
      ) : null}
      {upgrade ? (
        <Button
          label={upgrade}
          onPress={() => router.push('/paywall' as never)}
        />
      ) : null}
    </View>
  );
}
