import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { PRIVACY_POLICY_URL } from '@/domain/privacyPolicy';
import {
  MONTHLY_DISPLAY_NAME,
  MONTHLY_PRODUCT_ID,
  PRO_DISPLAY_NAME,
  PRO_PRODUCT_ID,
  SUBSCRIPTION_BENEFITS,
  SUBSCRIPTION_PRODUCT_IDS,
  TERMS_URL,
  UNLIMITED_DISPLAY_NAME,
  UNLIMITED_PRODUCT_ID,
  YEARLY_DISPLAY_NAME,
  YEARLY_PRODUCT_ID,
  defaultPlanId,
  entitlementActive,
  isSubscriptionProduct,
  orderedPlanIds,
  paywallEnabled,
  planOfferLine,
  purchaseOutcome,
  renewalDisclosure,
  storeKitJwsFromPurchase,
  trialButtonLabel,
  yearlySavingLabel,
} from '@/domain/subscription';
import { tierIncludedLine } from '@/domain/tierLimits';
import { rememberEntitlement } from '@/ui/useEntitlement';
import { stroke, useAppTheme } from '@/ui/theme';
import { Button, Card, ErrorNote, Field, Screen, T } from '@/ui/ui';

type StorePlan = {
  id: string;
  displayPrice: string;
  amount: number | null;
  currency: string | null;
  periodUnit: string | null;
  paymentMode: string | null;
};

type Phase = 'loading' | 'ready' | 'unavailable' | 'purchasing' | 'restoring';

const CANCELLED = 'Purchase cancelled.';
const PENDING = 'The purchase is waiting for approval. You can use Restore Purchases after it is approved.';
const FAILED = 'The purchase did not finish. Try again, or use Restore Purchases if you already subscribed.';
const UNAVAILABLE = 'The subscription is not available from the App Store right now.';
const IOS_ONLY = 'Subscriptions are available in the iOS app.';
const RESTORE_EMPTY = 'No subscription was found for this Apple ID.';
const ALREADY_OWNED = 'This Apple ID already has the subscription. Use Restore Purchases.';
const NOT_ACTIVE = 'This subscription is not active.';

function readPlan(value: unknown): StorePlan | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as {
    id?: unknown;
    displayPrice?: unknown;
    price?: unknown;
    currency?: unknown;
    subscriptionPeriodUnitIOS?: unknown;
    introductoryPricePaymentModeIOS?: unknown;
  };
  if (typeof row.id !== 'string' || !isSubscriptionProduct(row.id)) return null;
  if (typeof row.displayPrice !== 'string' || !row.displayPrice.trim()) return null;
  const amount = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : null;
  return {
    id: row.id,
    displayPrice: row.displayPrice.trim(),
    amount,
    currency: typeof row.currency === 'string' ? row.currency : null,
    periodUnit: typeof row.subscriptionPeriodUnitIOS === 'string' ? row.subscriptionPeriodUnitIOS : null,
    paymentMode: typeof row.introductoryPricePaymentModeIOS === 'string' ? row.introductoryPricePaymentModeIOS : null,
  };
}

function planName(id: string): string {
  if (id === YEARLY_PRODUCT_ID) return YEARLY_DISPLAY_NAME;
  if (id === MONTHLY_PRODUCT_ID) return MONTHLY_DISPLAY_NAME;
  if (id === PRO_PRODUCT_ID) return PRO_DISPLAY_NAME;
  if (id === UNLIMITED_PRODUCT_ID) return UNLIMITED_DISPLAY_NAME;
  return 'Subscription';
}

export default function PaywallScreen() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const theme = useAppTheme();
  const [phase, setPhase] = useState<Phase>(Platform.OS === 'ios' && paywallEnabled() ? 'loading' : 'unavailable');
  const [plans, setPlans] = useState<StorePlan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(YEARLY_PRODUCT_ID);
  const [note, setNote] = useState<string | null>(Platform.OS === 'ios' ? null : IOS_ONLY);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!paywallEnabled() || Platform.OS !== 'ios') return;
    let removeUpdate = () => {};
    let removeError = () => {};
    let stopped = false;

    const accept = async (purchase: { productId?: string | null; purchaseToken?: string | null; purchaseState?: string | null }) => {
      const picked = storeKitJwsFromPurchase(purchase);
      if (picked.kind === 'ignore') return;
      if (picked.kind === 'pending') {
        setPhase('ready');
        setNote(PENDING);
        return;
      }
      try {
        const row = await repo.verifyOwnSubscription(picked.jws);
        const iap = await import('expo-iap');
        await iap.finishTransaction({ purchase: purchase as never, isConsumable: false });
        if (!entitlementActive(row)) {
          setPhase('ready');
          setNote(NOT_ACTIVE);
          return;
        }
        if (snap.session?.userId) rememberEntitlement(snap.session.userId, row);
        router.replace('/home');
      } catch (err) {
        setPhase('ready');
        setError(shownError(err, FAILED));
      }
    };

    void (async () => {
      try {
        const iap = await import('expo-iap');
        if (stopped) return;
        await iap.initConnection();
        const updated = iap.purchaseUpdatedListener((purchase) => {
          void accept(purchase);
        });
        const failed = iap.purchaseErrorListener((purchaseError) => {
          const outcome = purchaseOutcome(purchaseError.code);
          setPhase('ready');
          setNote(outcome === 'cancelled' ? CANCELLED : outcome === 'pending' ? PENDING : outcome === 'restore' ? ALREADY_OWNED : FAILED);
        });
        removeUpdate = () => updated.remove();
        removeError = () => failed.remove();
        const listed = await iap.fetchProducts({ skus: [...SUBSCRIPTION_PRODUCT_IDS], type: 'subs' });
        if (stopped) return;
        const byId = new Map<string, StorePlan>();
        for (const item of listed ?? []) {
          const plan = readPlan(item);
          if (plan) byId.set(plan.id, plan);
        }
        const loaded = orderedPlanIds([...byId.keys()]).map((id) => byId.get(id)).filter((plan): plan is StorePlan => plan != null);
        setPlans(loaded);
        setSelectedId(defaultPlanId(loaded.map((plan) => plan.id)));
        setPhase(loaded.length ? 'ready' : 'unavailable');
        if (!loaded.length) setNote(UNAVAILABLE);
      } catch {
        if (!stopped) {
          setPhase('unavailable');
          setNote(UNAVAILABLE);
        }
      }
    })();

    return () => {
      stopped = true;
      removeUpdate();
      removeError();
    };
  }, [repo, router, snap.session?.userId]);

  const selected = plans.find((plan) => plan.id === selectedId) ?? null;
  const yearly = plans.find((plan) => plan.id === YEARLY_PRODUCT_ID) ?? null;
  const monthly = plans.find((plan) => plan.id === MONTHLY_PRODUCT_ID) ?? null;
  const saving = yearly && monthly
    ? yearlySavingLabel({
      yearlyAmount: yearly.amount,
      monthlyAmount: monthly.amount,
      currency: yearly.currency ?? monthly.currency,
    })
    : null;

  async function startTrial() {
    if (!selected || busy.current || Platform.OS !== 'ios') return;
    busy.current = true;
    setPhase('purchasing');
    setNote(null);
    setError(null);
    try {
      const iap = await import('expo-iap');
      await iap.requestPurchase({
        request: { apple: { sku: selected.id } },
        type: 'subs',
      });
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : null;
      const outcome = purchaseOutcome(code);
      setPhase('ready');
      setNote(outcome === 'cancelled' ? CANCELLED : outcome === 'pending' ? PENDING : FAILED);
    } finally {
      busy.current = false;
    }
  }

  async function restore() {
    if (busy.current || Platform.OS !== 'ios') return;
    busy.current = true;
    setPhase('restoring');
    setNote(null);
    setError(null);
    try {
      const iap = await import('expo-iap');
      await iap.initConnection();
      await iap.restorePurchases();
      const purchases = await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
      const match = purchases.find((purchase) => isSubscriptionProduct(purchase.productId));
      const picked = match ? storeKitJwsFromPurchase(match) : { kind: 'ignore' as const };
      if (picked.kind !== 'jws') {
        setPhase(plans.length ? 'ready' : 'unavailable');
        setNote(RESTORE_EMPTY);
        return;
      }
      const saved = await repo.verifyOwnSubscription(picked.jws);
      if (snap.session?.userId) rememberEntitlement(snap.session.userId, saved);
      if (!entitlementActive(saved)) {
        setPhase('ready');
        setNote(NOT_ACTIVE);
        return;
      }
      router.replace('/home');
    } catch (err) {
      setPhase(plans.length ? 'ready' : 'unavailable');
      setError(shownError(err, FAILED));
    } finally {
      busy.current = false;
    }
  }

  const freeTrial = selected?.paymentMode === 'free-trial';

  return (
    <Screen eyebrow="Subscription" title="Charioteer" intro="A subscription keeps these available.">
      <Card>
        {SUBSCRIPTION_BENEFITS.map((benefit) => <T key={benefit}>{benefit}</T>)}
        {phase === 'loading' ? <T variant="muted">Loading the subscription.</T> : null}
        <View style={{ gap: 14, alignSelf: 'stretch' }}>
          {([
            ['Standard', 'standard', [YEARLY_PRODUCT_ID, MONTHLY_PRODUCT_ID]],
            ['Pro', 'pro', [PRO_PRODUCT_ID]],
            ['Unlimited', 'unlimited', [UNLIMITED_PRODUCT_ID]],
          ] as const).map(([title, tier, ids]) => {
            const section = ids.map((id) => plans.find((plan) => plan.id === id)).filter((plan): plan is StorePlan => plan != null);
            if (!section.length) return null;
            return (
              <View key={tier} style={{ gap: 10, alignSelf: 'stretch' }}>
                <T variant="label">{title}</T>
                <T variant="muted">{tierIncludedLine(tier)}</T>
                {section.map((plan) => {
                  const chosen = plan.id === selected?.id;
                  const trial = plan.paymentMode === 'free-trial';
                  return (
                    <Card
                      key={plan.id}
                      featured={chosen}
                      accessibilityLabel={planName(plan.id)}
                      onPress={() => setSelectedId(plan.id)}
                      style={{ alignSelf: 'stretch', borderWidth: chosen ? stroke.featured : stroke.card, borderColor: chosen ? theme.colors.accent : theme.colors.line }}
                    >
                      {plan.id === YEARLY_PRODUCT_ID ? <T variant="label">Best value</T> : null}
                      <T style={{ fontFamily: theme.font.bodyStrong }}>{planName(plan.id)}</T>
                      <T>{planOfferLine(plan.displayPrice, plan.periodUnit, trial)}</T>
                      {plan.id === YEARLY_PRODUCT_ID && saving ? <T variant="muted">{saving}</T> : null}
                    </Card>
                  );
                })}
              </View>
            );
          })}
        </View>
        {selected ? <T variant="muted">{renewalDisclosure(selected.displayPrice, selected.periodUnit, freeTrial)}</T> : null}
        {note ? <T variant="muted">{note}</T> : null}
        <Button
          label={trialButtonLabel(selected?.paymentMode)}
          pending={phase === 'purchasing'}
          pendingLabel="Starting the subscription"
          disabled={!selected || phase === 'loading' || phase === 'unavailable' || phase === 'purchasing' || phase === 'restoring'}
          onPress={() => void startTrial()}
        />
        <Button
          label="Restore Purchases"
          tone="quiet"
          pending={phase === 'restoring'}
          pendingLabel="Restoring purchases"
          disabled={Platform.OS !== 'ios' || phase === 'purchasing' || phase === 'restoring'}
          onPress={() => void restore()}
        />
      </Card>
      <View style={{ gap: 8 }}>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_URL)}>
          <T style={{ textDecorationLine: 'underline' }}>Terms</T>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
          <T style={{ textDecorationLine: 'underline' }}>Privacy Policy</T>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/help' as never)}>
          <T style={{ textDecorationLine: 'underline' }}>Help and crisis lines</T>
        </Pressable>
      </View>
      <Field label="Type DELETE to remove the account" value={confirm} onChangeText={setConfirm} />
      <Button
        label="Delete account and data"
        tone="sos"
        disabled={confirm !== 'DELETE' || deleting}
        disabledReason={confirm === 'DELETE' ? undefined : 'Type DELETE to remove the account.'}
        pending={deleting}
        onPress={() => {
          setDeleting(true);
          void repo.deleteAccount()
            .catch((err: unknown) => setError(shownError(err, 'Could not delete the account.')))
            .finally(() => setDeleting(false));
        }}
      />
      <Button label="Sign out" tone="quiet" onPress={() => void repo.signOut().catch((err: unknown) => setError(shownError(err, 'Could not sign out.')))} />
      <ErrorNote>{error}</ErrorNote>
    </Screen>
  );
}
