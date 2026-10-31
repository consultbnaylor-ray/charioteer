import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useRepository, useSnapshot } from '@/data';
import { shownError } from '@/domain/errors';
import { PRIVACY_POLICY_URL } from '@/domain/privacyPolicy';
import {
  MONTHLY_PRODUCT_ID,
  SUBSCRIPTION_BENEFITS,
  TERMS_URL,
  entitlementActive,
  paywallEnabled,
  priceLine,
  purchaseOutcome,
  renewalDisclosure,
  storeKitJwsFromPurchase,
  trialButtonLabel,
} from '@/domain/subscription';
import { rememberEntitlement } from '@/ui/useEntitlement';
import { Button, Card, ErrorNote, Field, Screen, T } from '@/ui/ui';

type StoreProduct = {
  displayPrice: string;
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

function readProduct(value: unknown): StoreProduct | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as {
    id?: unknown;
    displayPrice?: unknown;
    subscriptionPeriodUnitIOS?: unknown;
    introductoryPricePaymentModeIOS?: unknown;
  };
  if (row.id !== MONTHLY_PRODUCT_ID || typeof row.displayPrice !== 'string' || !row.displayPrice.trim()) return null;
  return {
    displayPrice: row.displayPrice.trim(),
    periodUnit: typeof row.subscriptionPeriodUnitIOS === 'string' ? row.subscriptionPeriodUnitIOS : null,
    paymentMode: typeof row.introductoryPricePaymentModeIOS === 'string' ? row.introductoryPricePaymentModeIOS : null,
  };
}

export default function PaywallScreen() {
  const repo = useRepository();
  const snap = useSnapshot();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(Platform.OS === 'ios' && paywallEnabled() ? 'loading' : 'unavailable');
  const [product, setProduct] = useState<StoreProduct | null>(null);
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
        const listed = await iap.fetchProducts({ skus: [MONTHLY_PRODUCT_ID], type: 'subs' });
        if (stopped) return;
        const match = (listed ?? []).map(readProduct).find((item) => item !== null) ?? null;
        setProduct(match);
        setPhase(match ? 'ready' : 'unavailable');
        if (!match) setNote(UNAVAILABLE);
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

  async function startTrial() {
    if (!product || busy.current || Platform.OS !== 'ios') return;
    busy.current = true;
    setPhase('purchasing');
    setNote(null);
    setError(null);
    try {
      const iap = await import('expo-iap');
      await iap.requestPurchase({
        request: { apple: { sku: MONTHLY_PRODUCT_ID } },
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
      const match = purchases.find((purchase) => purchase.productId === MONTHLY_PRODUCT_ID);
      const picked = match ? storeKitJwsFromPurchase(match) : { kind: 'ignore' as const };
      if (picked.kind !== 'jws') {
        setPhase(product ? 'ready' : 'unavailable');
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
      setPhase(product ? 'ready' : 'unavailable');
      setError(shownError(err, FAILED));
    } finally {
      busy.current = false;
    }
  }

  const freeTrial = product?.paymentMode === 'free-trial';
  const price = product ? priceLine(product.displayPrice, product.periodUnit) : '';

  return (
    <Screen eyebrow="Subscription" title="Charioteer" intro="A monthly subscription keeps these available.">
      <Card>
        {SUBSCRIPTION_BENEFITS.map((benefit) => <T key={benefit}>{benefit}</T>)}
        {phase === 'loading' ? <T variant="muted">Loading the subscription.</T> : null}
        {price ? <T>{price}</T> : null}
        {product ? <T variant="muted">{renewalDisclosure(product.displayPrice, freeTrial)}</T> : null}
        {note ? <T variant="muted">{note}</T> : null}
        <Button
          label={trialButtonLabel(product?.paymentMode)}
          pending={phase === 'purchasing'}
          pendingLabel="Starting the subscription"
          disabled={!product || phase === 'loading' || phase === 'unavailable' || phase === 'purchasing' || phase === 'restoring'}
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
