import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PRIVACY_POLICY_URL } from '@/domain/privacyPolicy';
import {
  APPLE_APP_ID,
  MONTHLY_PRODUCT_ID,
  SUBSCRIPTION_BENEFITS,
  SUBSCRIPTION_GROUP_ID,
  TERMS_URL,
  YEARLY_PRODUCT_ID,
  applyServerNotification,
  defaultPlanId,
  entitlementActive,
  orderedPlanIds,
  paywallEnabled,
  paywallRequired,
  planOfferLine,
  purchaseOutcome,
  readNotificationClaims,
  readTransactionClaims,
  renewalDisclosure,
  routeAllowedWithoutSubscription,
  storeKitJwsFromPurchase,
  subscriptionRecordFromDb,
  subscriptionStatusLabel,
  trialButtonLabel,
  yearlySavingLabel,
  type VerifiedSubscription,
} from '@/domain/subscription';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
const LATER = Date.parse('2026-11-30T12:00:00.000Z');

function subscription(patch: Partial<VerifiedSubscription> = {}): VerifiedSubscription {
  return {
    originalTransactionId: '1000000000000001',
    productId: MONTHLY_PRODUCT_ID,
    status: 'active',
    expiresAt: new Date(LATER).toISOString(),
    isTrial: false,
    environment: 'Production',
    ...patch,
  };
}

describe('subscription paywall', () => {
  it('keeps both App Store product ids in one place', () => {
    expect(YEARLY_PRODUCT_ID).toBe('Sta');
    expect(MONTHLY_PRODUCT_ID).toBe('charioteer.monthly');
    expect(SUBSCRIPTION_GROUP_ID).toBe('22532571');
    const rules = readFileSync('supabase/functions/_shared/tierLimits.ts', 'utf8');
    expect(rules).toContain("export const YEARLY_PRODUCT_ID = 'Sta'");
    expect(rules).toContain("export const MONTHLY_PRODUCT_ID = 'charioteer.monthly'");
    expect(rules).toContain("export const PRO_PRODUCT_ID = 'charioteer.pro.monthly'");
    expect(rules).toContain("export const UNLIMITED_PRODUCT_ID = 'charioteer.unlimited.monthly'");
    const storekit = JSON.parse(readFileSync('Charioteer.storekit', 'utf8')) as {
      settings: { _applicationInternalID: string };
      subscriptionGroups: Array<{ id: string; name: string; subscriptions: Array<{
        productID: string;
        referenceName: string;
        internalID: string;
        groupNumber: number;
        recurringSubscriptionPeriod: string;
        displayPrice: string;
        localizations: Array<{ displayName: string }>;
        introductoryOffer: { paymentMode: string; subscriptionPeriod: string; numberOfPeriods: number };
      }> }>;
    };
    const group = storekit.subscriptionGroups[0];
    expect(group.name).toBe('Charioteer');
    expect(group.id).toBe('22532571');
    const yearly = group.subscriptions.find((item) => item.productID === 'Sta');
    const monthly = group.subscriptions.find((item) => item.productID === 'charioteer.monthly');
    expect(yearly?.referenceName).toBe('Standard');
    expect(yearly?.localizations[0]?.displayName).toBe('Charioteer Standard');
    expect(yearly?.internalID).toBe('6829273648');
    expect(yearly?.recurringSubscriptionPeriod).toBe('P1Y');
    expect(yearly?.displayPrice).toBe('39.99');
    expect(yearly?.introductoryOffer.paymentMode).toBe('free');
    expect(yearly?.introductoryOffer.subscriptionPeriod).toBe('P1W');
    expect(monthly?.recurringSubscriptionPeriod).toBe('P1M');
    expect(monthly?.displayPrice).toBe('3.99');
    expect(monthly?.introductoryOffer).toMatchObject({ paymentMode: 'free', subscriptionPeriod: 'P1W', numberOfPeriods: 1 });
    expect(monthly?.groupNumber).toBe(3);
    const pro = group.subscriptions.find((item) => item.productID === 'charioteer.pro.monthly');
    const maxPlan = group.subscriptions.find((item) => item.productID === 'charioteer.unlimited.monthly');
    expect(pro?.groupNumber).toBe(2);
    expect(pro?.introductoryOffer.paymentMode).toBe('free');
    expect(maxPlan?.groupNumber).toBe(1);
    expect(maxPlan?.referenceName).toBe('Max');
    expect(maxPlan?.localizations[0]?.displayName).toBe('Charioteer Max');
    expect(maxPlan?.introductoryOffer.subscriptionPeriod).toBe('P1W');
    expect(subscriptionStatusLabel(subscription({ productId: 'charioteer.unlimited.monthly' }), NOW)).toBe('Max · Active');
    expect(readFileSync('src/app/paywall.tsx', 'utf8')).not.toMatch(/Unlimited|unlimited/);
    expect(readFileSync('src/ui/AiLimitCard.tsx', 'utf8')).not.toMatch(/Unlimited|unlimited/);
    expect(yearly?.groupNumber).toBe(3);
    expect(storekit.settings._applicationInternalID).toBe(String(APPLE_APP_ID));
    expect(readFileSync('src/app/paywall.tsx', 'utf8')).not.toMatch(/3\.99|39\.99|£/);
    expect(readFileSync('src/ui/SubscriptionRow.tsx', 'utf8')).not.toMatch(/3\.99|£/);
    expect(orderedPlanIds(['charioteer.monthly', 'Sta', 'other'])).toEqual(['Sta', 'charioteer.monthly']);
    expect(defaultPlanId(['charioteer.monthly'])).toBe('charioteer.monthly');
    expect(defaultPlanId(['Sta', 'charioteer.monthly'])).toBe('Sta');
    expect(yearlySavingLabel({ yearlyAmount: 39.99, monthlyAmount: 3.99, currency: 'GBP' })).toBe('Save £7.89 compared with 12 months');
    expect(yearlySavingLabel({ yearlyAmount: 39.99, monthlyAmount: 3.99, currency: null })).toBeNull();
  });

  it('leaves the app ungated unless the build flag is exactly true', () => {
    expect(paywallEnabled({})).toBe(false);
    expect(paywallEnabled({ EXPO_PUBLIC_PAYWALL_ENABLED: undefined })).toBe(false);
    expect(paywallEnabled({ EXPO_PUBLIC_PAYWALL_ENABLED: 'false' })).toBe(false);
    expect(paywallEnabled({ EXPO_PUBLIC_PAYWALL_ENABLED: 'TRUE' })).toBe(false);
    expect(paywallEnabled({ EXPO_PUBLIC_PAYWALL_ENABLED: 'true' })).toBe(true);
    const open = { enabled: false, authed: true, onboarded: true, consentDue: false, entitled: false };
    expect(paywallRequired(open)).toBe(false);
    expect(readFileSync('src/app/_layout.tsx', 'utf8')).toContain('paywallRequired');
    expect(readFileSync('src/app/_layout.tsx', 'utf8')).not.toContain('expo-iap');
    expect(readFileSync('src/ui/useEntitlement.ts', 'utf8')).toContain('if (!enabled || !snap.ready) return');
    expect(readFileSync('src/app/paywall.tsx', 'utf8')).not.toMatch(/^import .*expo-iap/m);
    expect(readFileSync('src/app/paywall.tsx', 'utf8')).toContain("import('expo-iap')");
    expect(readFileSync('src/domain/subscription.ts', 'utf8')).not.toMatch(/bypass|allowlist@|reviewer@/i);
  });

  it('shows the paywall only after sign-in, onboarding, and consent, and keeps help reachable', () => {
    const base = { enabled: true, authed: true, onboarded: true, consentDue: false, entitled: false };
    expect(paywallRequired(base)).toBe(true);
    expect(paywallRequired({ ...base, entitled: true })).toBe(false);
    expect(paywallRequired({ ...base, authed: false })).toBe(false);
    expect(paywallRequired({ ...base, onboarded: false })).toBe(false);
    expect(paywallRequired({ ...base, consentDue: true })).toBe(false);
    expect(routeAllowedWithoutSubscription('/paywall')).toBe(true);
    expect(routeAllowedWithoutSubscription('/help')).toBe(true);
    expect(routeAllowedWithoutSubscription('/privacy')).toBe(true);
    expect(routeAllowedWithoutSubscription('/sign-in')).toBe(true);
    expect(routeAllowedWithoutSubscription('/sign-up')).toBe(true);
    expect(routeAllowedWithoutSubscription('/set-password')).toBe(true);
    expect(routeAllowedWithoutSubscription('/profile')).toBe(false);
    expect(routeAllowedWithoutSubscription('/home')).toBe(false);
    expect(routeAllowedWithoutSubscription('/thumos')).toBe(false);
    const paywall = readFileSync('src/app/paywall.tsx', 'utf8');
    expect(paywall).toContain('Delete account and data');
    expect(paywall).toContain('Sign out');
    expect(paywall).toContain('Restore Purchases');
    expect(paywall).toContain("router.push('/help'");
    expect(paywall).toContain('TERMS_URL');
    expect(paywall).toContain('PRIVACY_POLICY_URL');
    expect(paywall).toContain('Best value');
    expect(paywall).toContain('SUBSCRIPTION_BENEFITS.map');
    expect(paywall).toContain('SUBSCRIPTION_PRODUCT_IDS');
    expect(TERMS_URL).toBe('https://quanticalabs.co.uk/charioteer/terms');
    expect(PRIVACY_POLICY_URL).toBe('https://quanticalabs.co.uk/charioteer/privacy');
    expect(SUBSCRIPTION_BENEFITS).toEqual(['Thumos coach', 'Check-ins', 'Health insights', 'Community']);
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain('<SubscriptionRow />');
    expect(readFileSync('src/ui/SubscriptionRow.tsx', 'utf8')).toContain('showManageSubscriptionsIOS');
    expect(readFileSync('src/ui/SubscriptionRow.tsx', 'utf8')).toContain('Manage subscription');
    const subscriptionRow = readFileSync('src/ui/SubscriptionRow.tsx', 'utf8');
    expect(subscriptionRow).toContain('Change plan');
    expect(subscriptionRow).toContain("router.push('/paywall'");
    expect(subscriptionRow.indexOf('Change plan')).toBeLessThan(subscriptionRow.indexOf('Manage subscription'));
    expect(readFileSync('src/app/_layout.tsx', 'utf8')).not.toContain("pathname === '/paywall'");
    expect(readFileSync('src/app/(main)/_layout.tsx', 'utf8')).toContain('subscriptionLocked');
  });

  it('builds the Apple renewal sentence from the StoreKit price', () => {
    expect(renewalDisclosure('£39.99', 'year', true)).toBe(
      '£39.99 per year after a 1-week free trial. Renews automatically unless cancelled at least 24 hours before the end of the period. Manage or cancel in Settings > Apple ID > Subscriptions.',
    );
    expect(planOfferLine('£39.99', 'year', true)).toBe('1-week free trial, then £39.99 a year');
    expect(planOfferLine('£3.99', 'month', true)).toBe('1-week free trial, then £3.99 a month');
    expect(renewalDisclosure('€4,99', 'month', true)).toContain('€4,99 per month after a 1-week free trial.');
    expect(renewalDisclosure('$39.99', 'year', false)).toContain('$39.99 per year.');
    expect(renewalDisclosure('$39.99', 'year', false)).not.toContain('free trial');
    expect(trialButtonLabel('free-trial')).toBe('Start free trial');
    expect(trialButtonLabel('pay-as-you-go')).toBe('Subscribe');
    expect(trialButtonLabel(null)).toBe('Subscribe');
  });

  it('treats an unexpired trial, grace, or cancellation as entitled and ignores other products', () => {
    expect(entitlementActive(subscription({ isTrial: true, environment: 'Sandbox' }), NOW)).toBe(true);
    expect(entitlementActive(subscription({ environment: 'Xcode' }), NOW)).toBe(true);
    expect(entitlementActive(subscription({ status: 'grace' }), NOW)).toBe(true);
    expect(entitlementActive(subscription({ status: 'billing_retry' }), NOW)).toBe(true);
    expect(entitlementActive(subscription({ status: 'cancelled' }), NOW)).toBe(true);
    expect(entitlementActive(subscription({ status: 'expired', expiresAt: new Date(NOW - 1000).toISOString() }), NOW)).toBe(false);
    expect(entitlementActive(subscription({ status: 'revoked' }), NOW)).toBe(false);
    expect(entitlementActive(subscription({ expiresAt: new Date(NOW).toISOString() }), NOW)).toBe(false);
    expect(entitlementActive(subscription({ productId: YEARLY_PRODUCT_ID }), NOW)).toBe(true);
    expect(entitlementActive(subscription({ productId: 'Other' }), NOW)).toBe(false);
    expect(entitlementActive(null, NOW)).toBe(false);
    expect(subscriptionStatusLabel(subscription({ isTrial: true }), NOW)).toBe('Standard · Free trial');
    expect(subscriptionStatusLabel(subscription({ productId: YEARLY_PRODUCT_ID }), NOW)).toBe('Standard yearly · Active');
    expect(subscriptionStatusLabel(null, NOW)).toBe('No subscription');
  });

  it('maps StoreKit purchases without a bypass account', () => {
    expect(purchaseOutcome('user-cancelled')).toBe('cancelled');
    expect(purchaseOutcome('deferred-payment')).toBe('pending');
    expect(purchaseOutcome('already-owned')).toBe('restore');
    expect(purchaseOutcome('unknown')).toBe('failed');
    expect(storeKitJwsFromPurchase({ productId: 'Sta', purchaseToken: 'header.payload.sig', purchaseState: 'purchased' })).toEqual({
      kind: 'jws',
      jws: 'header.payload.sig',
    });
    expect(storeKitJwsFromPurchase({ productId: 'Sta', purchaseToken: 'header.payload.sig', purchaseState: 'pending' })).toEqual({ kind: 'pending' });
    expect(storeKitJwsFromPurchase({ productId: 'charioteer.monthly', purchaseToken: 'header.payload.sig', purchaseState: 'purchased' }).kind).toBe('jws');
    expect(storeKitJwsFromPurchase({ productId: 'Other', purchaseToken: 'header.payload.sig' })).toEqual({ kind: 'ignore' });
    expect(readFileSync('src/domain/subscription.ts', 'utf8')).not.toContain('@');
  });

  it('reads a verified transaction and applies renewal notifications', () => {
    const trial = readTransactionClaims({
      bundleId: 'uk.co.quanticalabs.charioteer',
      productId: 'Sta',
      originalTransactionId: '2000000000000001',
      expiresDate: LATER,
      environment: 'Sandbox',
      offerType: 1,
      offerDiscountType: 'FREE_TRIAL',
    }, NOW);
    expect(trial.ok).toBe(true);
    if (!trial.ok) return;
    expect(trial.subscription.productId).toBe('Sta');
    expect(trial.subscription.isTrial).toBe(true);
    expect(trial.subscription.status).toBe('active');
    expect(trial.subscription.environment).toBe('Sandbox');

    const revoked = readTransactionClaims({
      bundleId: 'uk.co.quanticalabs.charioteer',
      productId: 'Sta',
      originalTransactionId: '2000000000000001',
      expiresDate: LATER,
      revocationDate: NOW,
      environment: 'Production',
    }, NOW);
    expect(revoked.ok && revoked.subscription.status).toBe('revoked');
    expect(readTransactionClaims({
      bundleId: 'uk.co.quanticalabs.charioteer',
      productId: 'monthly',
      originalTransactionId: '2000000000000001',
      expiresDate: LATER,
      environment: 'Production',
    }, NOW)).toMatchObject({ ok: false, reason: 'product' });
    expect(readTransactionClaims({
      bundleId: 'other.app',
      productId: 'Sta',
      originalTransactionId: '2000000000000001',
      expiresDate: LATER,
      environment: 'Production',
    }, NOW)).toMatchObject({ ok: false, reason: 'bundle' });

    const cancelled = applyServerNotification(trial.subscription, 'DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_DISABLED');
    expect(cancelled.status).toBe('cancelled');
    expect(entitlementActive(cancelled, NOW)).toBe(true);
    expect(applyServerNotification(trial.subscription, 'DID_FAIL_TO_RENEW', 'GRACE_PERIOD').status).toBe('grace');
    expect(applyServerNotification(trial.subscription, 'REFUND', null).status).toBe('revoked');
    expect(applyServerNotification(trial.subscription, 'EXPIRED', 'VOLUNTARY').status).toBe('expired');

    expect(readNotificationClaims({ notificationType: 'TEST' })).toEqual({ ok: true, kind: 'test' });
    expect(readNotificationClaims({
      notificationType: 'DID_RENEW',
      subtype: 'BILLING_RECOVERY',
      data: {
        bundleId: 'uk.co.quanticalabs.charioteer',
        appAppleId: APPLE_APP_ID,
        signedTransactionInfo: 'a.b.c',
      },
    })).toMatchObject({ ok: true, kind: 'transaction', notificationType: 'DID_RENEW' });
    expect(readNotificationClaims({
      notificationType: 'DID_RENEW',
      data: { bundleId: 'uk.co.quanticalabs.charioteer', appAppleId: 1, signedTransactionInfo: 'a.b.c' },
    })).toMatchObject({ ok: false, reason: 'app' });
  });

  it('stores subscription rows for the owner only and verifies the JWS on the server', () => {
    expect(subscriptionRecordFromDb({
      product_id: 'Sta',
      status: 'active',
      expires_at: new Date(LATER).toISOString(),
      is_trial: false,
      environment: 'Production',
    })?.productId).toBe('Sta');
    expect(subscriptionRecordFromDb({
      product_id: 'Sta',
      status: 'comped',
      expires_at: new Date(LATER).toISOString(),
      is_trial: false,
      environment: 'Production',
    })).toBeNull();

    const migration = readFileSync('supabase/migrations/20261031120000_subscriptions.sql', 'utf8');
    expect(migration).toContain('user_id uuid primary key');
    expect(migration).toContain('original_transaction_id');
    expect(migration).toContain('for select to authenticated');
    expect(migration).toContain('user_id = auth.uid()');
    expect(migration).toContain('grant all on table public.subscriptions to service_role');
    expect(migration).toContain('grant select on table public.subscriptions to authenticated');
    expect(migration).not.toMatch(/for insert|for update|for delete/i);

    const verify = readFileSync('supabase/functions/subscription-verify/index.ts', 'utf8');
    expect(verify).toContain('verifyProductionJws');
    expect(verify).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(verify).toContain("code: 'taken'");
    expect(verify).not.toContain('console.log');
    const notes = readFileSync('supabase/functions/appstore-notifications/index.ts', 'utf8');
    expect(notes).toContain('verifyProductionJws');
    expect(notes).toContain('applyServerNotification');
    const config = readFileSync('supabase/config.toml', 'utf8');
    expect(config).toContain('[functions.subscription-verify]\nverify_jwt = true');
    expect(config).toContain('[functions.appstore-notifications]\nverify_jwt = false');

    const app = JSON.parse(readFileSync('app.json', 'utf8')) as {
      expo: {
        ios: { entitlements: Record<string, unknown>; infoPlist: Record<string, unknown> };
        plugins: unknown[];
      };
    };
    expect(app.expo.plugins).toContain('expo-iap');
    expect(app.expo.plugins.some((entry) => Array.isArray(entry) && entry[0] === 'expo-iap')).toBe(false);
    expect(Object.keys(app.expo.ios.entitlements).sort()).toEqual(['aps-environment', 'com.apple.developer.healthkit']);
    expect(app.expo.ios.entitlements['com.apple.developer.in-app-payments']).toBeUndefined();
    expect(Object.keys(app.expo.ios.infoPlist).sort()).toEqual([
      'CFBundleDisplayName',
      'LSApplicationQueriesSchemes',
      'NSCameraUsageDescription',
      'NSHealthShareUsageDescription',
      'NSHealthUpdateUsageDescription',
      'NSPhotoLibraryAddUsageDescription',
      'NSPhotoLibraryUsageDescription',
      'UIBackgroundModes',
    ]);
  });
});
