import { isPaywallFlagOn } from '../../supabase/functions/_shared/subscriptionRules.ts';

export {
  APPLE_APP_ID,
  BUNDLE_ID,
  MONTHLY_PRODUCT_ID,
  SUBSCRIPTION_BENEFITS,
  SUBSCRIPTION_GROUP_NAME,
  SUBSCRIPTION_REFERENCE_NAME,
  TERMS_URL,
  applyServerNotification,
  entitlementActive,
  isPaywallFlagOn,
  paywallRequired,
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
} from '../../supabase/functions/_shared/subscriptionRules.ts';

export type {
  SubscriptionRecord,
  SubscriptionStatus,
  VerifiedSubscription,
} from '../../supabase/functions/_shared/subscriptionRules.ts';

/** Build flag. Unset or anything other than the string true leaves the app as it is today. */
export function paywallEnabled(env?: { EXPO_PUBLIC_PAYWALL_ENABLED?: string }): boolean {
  const value = env === undefined ? process.env.EXPO_PUBLIC_PAYWALL_ENABLED : env.EXPO_PUBLIC_PAYWALL_ENABLED;
  return isPaywallFlagOn(value);
}
