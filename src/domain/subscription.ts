import { isPaywallFlagOn } from '../../supabase/functions/_shared/subscriptionRules.ts';

export {
  APPLE_APP_ID,
  BUNDLE_ID,
  MONTHLY_DISPLAY_NAME,
  MONTHLY_PRODUCT_ID,
  PRO_DISPLAY_NAME,
  PRO_PRODUCT_ID,
  SUBSCRIPTION_BENEFITS,
  SUBSCRIPTION_GROUP_ID,
  SUBSCRIPTION_GROUP_NAME,
  SUBSCRIPTION_PRODUCT_IDS,
  SUBSCRIPTION_REFERENCE_NAME,
  TERMS_URL,
  UNLIMITED_DISPLAY_NAME,
  UNLIMITED_PRODUCT_ID,
  YEARLY_DISPLAY_NAME,
  YEARLY_PRODUCT_ID,
  YEARLY_REFERENCE_NAME,
  applyServerNotification,
  defaultPlanId,
  entitlementActive,
  isPaywallFlagOn,
  isSubscriptionProduct,
  orderedPlanIds,
  paywallRequired,
  periodPhrase,
  planOfferLine,
  planTitle,
  priceLine,
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
} from '../../supabase/functions/_shared/subscriptionRules.ts';

export type {
  SubscriptionRecord,
  SubscriptionStatus,
  VerifiedSubscription,
} from '../../supabase/functions/_shared/subscriptionRules.ts';

/** Build flag. Unset or anything other than the string true leaves the app as it is today. */
/** On the plans screen when this build has the App Store purchase switched off, such as TestFlight. */
export const PAYWALL_OFF_NOTE = "Upgrades can't be bought in this test build yet. They open when Charioteer is on the App Store. Your current plan and credits still work.";

/** The plans screen note before the store loads: iOS only, or the purchase switched off in this build. */
export function paywallOpeningNote(os: string, enabled: boolean): string | null {
  if (os !== 'ios') return 'Subscriptions are available in the iOS app.';
  return enabled ? null : PAYWALL_OFF_NOTE;
}

export function paywallEnabled(env?: { EXPO_PUBLIC_PAYWALL_ENABLED?: string }): boolean {
  const value = env === undefined ? process.env.EXPO_PUBLIC_PAYWALL_ENABLED : env.EXPO_PUBLIC_PAYWALL_ENABLED;
  return isPaywallFlagOn(value);
}
