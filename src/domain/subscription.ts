import { isPaywallFlagOn } from '../../supabase/functions/_shared/subscriptionRules.ts';

export {
  APPLE_APP_ID,
  BUNDLE_ID,
  MONTHLY_DISPLAY_NAME,
  MONTHLY_PRODUCT_ID,
  SUBSCRIPTION_BENEFITS,
  SUBSCRIPTION_GROUP_ID,
  SUBSCRIPTION_GROUP_NAME,
  SUBSCRIPTION_PRODUCT_IDS,
  SUBSCRIPTION_REFERENCE_NAME,
  TERMS_URL,
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
export function paywallEnabled(env?: { EXPO_PUBLIC_PAYWALL_ENABLED?: string }): boolean {
  const value = env === undefined ? process.env.EXPO_PUBLIC_PAYWALL_ENABLED : env.EXPO_PUBLIC_PAYWALL_ENABLED;
  return isPaywallFlagOn(value);
}
