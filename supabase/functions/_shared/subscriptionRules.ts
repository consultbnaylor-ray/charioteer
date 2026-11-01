/**
 * Four auto-renewable products in App Store subscription group 22532571.
 * Standard: yearly `Sta` and monthly `charioteer.monthly`.
 * Pro: `charioteer.pro.monthly`. Max: `charioteer.unlimited.monthly` (tier `max`).
 * The ids and tiers live in tierLimits.ts.
 */
import {
  MONTHLY_PRODUCT_ID,
  PRO_PRODUCT_ID,
  UNLIMITED_PRODUCT_ID,
  YEARLY_PRODUCT_ID,
  isSubscriptionProduct,
} from './tierLimits.ts';

export {
  MONTHLY_PRODUCT_ID,
  PRO_PRODUCT_ID,
  SUBSCRIPTION_PRODUCT_IDS,
  UNLIMITED_PRODUCT_ID,
  YEARLY_PRODUCT_ID,
  defaultPlanId,
  isSubscriptionProduct,
  orderedPlanIds,
  tierForProduct,
} from './tierLimits.ts';

export const YEARLY_REFERENCE_NAME = 'Standard';

export const YEARLY_DISPLAY_NAME = 'Charioteer Standard';

export const MONTHLY_DISPLAY_NAME = 'Monthly';

export const PRO_DISPLAY_NAME = 'Pro';

export const UNLIMITED_DISPLAY_NAME = 'Charioteer Max';

export const SUBSCRIPTION_REFERENCE_NAME = YEARLY_REFERENCE_NAME;

export const SUBSCRIPTION_GROUP_NAME = 'Charioteer';

export const SUBSCRIPTION_GROUP_ID = '22532571';

export const APPLE_APP_ID = 6821371422;

export const BUNDLE_ID = 'uk.co.quanticalabs.charioteer';

export const TERMS_URL = 'https://quanticalabs.co.uk/charioteer/terms';

export const SUBSCRIPTION_BENEFITS = [
  'Thumos coach',
  'Check-ins',
  'Health insights',
  'Community',
] as const;

export const SUBSCRIPTION_STATUSES = [
  'active',
  'expired',
  'revoked',
  'grace',
  'billing_retry',
  'cancelled',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const STORE_ENVIRONMENTS = ['Sandbox', 'Production', 'Xcode'] as const;

export type StoreEnvironment = (typeof STORE_ENVIRONMENTS)[number];

export type SubscriptionRecord = {
  productId: string;
  status: SubscriptionStatus;
  expiresAt: string | null;
  isTrial: boolean;
  environment: StoreEnvironment;
};

export type VerifiedSubscription = SubscriptionRecord & {
  originalTransactionId: string;
  expiresAt: string;
};

const FREE_ROUTES = ['/paywall', '/help', '/privacy', '/sign-in', '/sign-up', '/set-password'];

const TRANSACTION_ID = /^[0-9A-Za-z._-]{1,128}$/;

export function isPaywallFlagOn(value: string | undefined): boolean {
  return value === 'true';
}

export function planTitle(productId: string | null | undefined): string | null {
  if (productId === YEARLY_PRODUCT_ID) return 'Standard yearly';
  if (productId === MONTHLY_PRODUCT_ID) return 'Standard';
  if (productId === PRO_PRODUCT_ID) return 'Pro';
  if (productId === UNLIMITED_PRODUCT_ID) return 'Max';
  return null;
}

export function entitlementActive(row: SubscriptionRecord | null, now = Date.now()): boolean {
  if (!row) return false;
  if (!isSubscriptionProduct(row.productId)) return false;
  if (row.status === 'revoked' || row.status === 'expired') return false;
  if (row.status !== 'active' && row.status !== 'grace' && row.status !== 'billing_retry' && row.status !== 'cancelled') return false;
  if (!STORE_ENVIRONMENTS.includes(row.environment)) return false;
  if (!row.expiresAt) return false;
  const expires = Date.parse(row.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

export function paywallRequired(input: {
  enabled: boolean;
  authed: boolean;
  onboarded: boolean;
  consentDue: boolean;
  entitled: boolean;
}): boolean {
  return input.enabled && input.authed && input.onboarded && !input.consentDue && !input.entitled;
}

export function routeAllowedWithoutSubscription(pathname: string): boolean {
  return FREE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function trialButtonLabel(paymentMode: string | null | undefined): string {
  return paymentMode === 'free-trial' ? 'Start free trial' : 'Subscribe';
}

export function periodPhrase(periodUnit: string | null | undefined, form: 'per' | 'a'): string {
  if (periodUnit === 'year') return form === 'per' ? 'per year' : 'a year';
  if (periodUnit === 'month') return form === 'per' ? 'per month' : 'a month';
  return '';
}

export function priceLine(displayPrice: string, periodUnit: string | null | undefined): string {
  const price = displayPrice.trim();
  if (!price) return '';
  const period = periodPhrase(periodUnit, 'per');
  return period ? `${price} ${period}` : price;
}

/** Shown on a plan card. The price string comes from StoreKit. */
export function planOfferLine(displayPrice: string, periodUnit: string | null | undefined, freeTrial: boolean): string {
  const price = displayPrice.trim();
  const period = periodPhrase(periodUnit, 'a');
  const tail = period ? `${price} ${period}` : price;
  return freeTrial ? `1-week free trial, then ${tail}` : tail;
}

/** Apple's auto-renew disclosure. The price string comes from StoreKit. */
export function renewalDisclosure(displayPrice: string, periodUnit: string | null | undefined, freeTrial: boolean): string {
  const price = displayPrice.trim();
  const period = periodPhrase(periodUnit, 'per') || 'per period';
  const lead = freeTrial
    ? `${price} ${period} after a 1-week free trial.`
    : `${price} ${period}.`;
  return `${lead} Renews automatically unless cancelled at least 24 hours before the end of the period. Manage or cancel in Settings > Apple ID > Subscriptions.`;
}

/**
 * Saving of yearly against 12 monthly store prices.
 * Amounts are the numeric StoreKit prices in one currency. The words use that currency code.
 */
export function yearlySavingLabel(input: {
  yearlyAmount: number | null;
  monthlyAmount: number | null;
  currency: string | null;
}): string | null {
  const yearly = input.yearlyAmount;
  const monthly = input.monthlyAmount;
  const currency = input.currency?.trim().toUpperCase() ?? '';
  if (yearly == null || monthly == null || !Number.isFinite(yearly) || !Number.isFinite(monthly)) return null;
  if (yearly <= 0 || monthly <= 0) return null;
  const saved = monthly * 12 - yearly;
  if (!(saved > 0.004)) return null;
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  try {
    const formatted = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(saved);
    return `Save ${formatted} compared with 12 months`;
  } catch {
    return null;
  }
}

export function subscriptionStatusLabel(row: SubscriptionRecord | null, now = Date.now()): string {
  if (!row) return 'No subscription';
  const plan = planTitle(row.productId);
  const state = row.isTrial && entitlementActive(row, now)
    ? 'Free trial'
    : row.status === 'cancelled' && entitlementActive(row, now)
      ? 'Cancels at period end'
      : row.status === 'grace' && entitlementActive(row, now)
        ? 'Billing grace period'
        : row.status === 'billing_retry' && entitlementActive(row, now)
          ? 'Billing retry'
          : entitlementActive(row, now)
            ? 'Active'
            : row.status === 'revoked'
              ? 'Revoked'
              : row.status === 'expired'
                ? 'Expired'
                : 'Inactive';
  return plan ? `${plan} · ${state}` : state;
}

export function purchaseOutcome(code: string | null | undefined): 'cancelled' | 'pending' | 'restore' | 'failed' {
  if (code === 'user-cancelled' || code === 'interrupted') return 'cancelled';
  if (code === 'pending' || code === 'deferred-payment') return 'pending';
  if (code === 'already-owned') return 'restore';
  return 'failed';
}

export function storeKitJwsFromPurchase(purchase: {
  productId?: string | null;
  purchaseToken?: string | null;
  purchaseState?: string | null;
}): { kind: 'pending' } | { kind: 'ignore' } | { kind: 'jws'; jws: string } {
  if (!isSubscriptionProduct(purchase.productId)) return { kind: 'ignore' };
  if (purchase.purchaseState === 'pending') return { kind: 'pending' };
  const jws = purchase.purchaseToken?.trim() ?? '';
  if (!jws) return { kind: 'ignore' };
  return { kind: 'jws', jws };
}

export function subscriptionRecordFromDb(row: {
  product_id?: unknown;
  status?: unknown;
  expires_at?: unknown;
  is_trial?: unknown;
  environment?: unknown;
} | null): SubscriptionRecord | null {
  if (!row) return null;
  if (typeof row.product_id !== 'string' || typeof row.status !== 'string' || typeof row.environment !== 'string') return null;
  if (!SUBSCRIPTION_STATUSES.includes(row.status as SubscriptionStatus)) return null;
  if (!STORE_ENVIRONMENTS.includes(row.environment as StoreEnvironment)) return null;
  const expiresAt = row.expires_at == null ? null : typeof row.expires_at === 'string' ? row.expires_at : null;
  if (row.expires_at != null && expiresAt == null) return null;
  return {
    productId: row.product_id,
    status: row.status as SubscriptionStatus,
    expiresAt,
    isTrial: row.is_trial === true,
    environment: row.environment as StoreEnvironment,
  };
}

type ClaimsResult = { ok: true; subscription: VerifiedSubscription } | { ok: false; reason: 'claims' | 'bundle' | 'product' | 'environment' | 'transaction' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function readTransactionClaims(payload: unknown, now = Date.now()): ClaimsResult {
  const body = asRecord(payload);
  if (!body) return { ok: false, reason: 'claims' };
  if (body.bundleId !== BUNDLE_ID) return { ok: false, reason: 'bundle' };
  if (typeof body.productId !== 'string' || !isSubscriptionProduct(body.productId)) return { ok: false, reason: 'product' };
  if (typeof body.environment !== 'string' || !STORE_ENVIRONMENTS.includes(body.environment as StoreEnvironment)) {
    return { ok: false, reason: 'environment' };
  }
  const original = body.originalTransactionId;
  if (typeof original !== 'string' || !TRANSACTION_ID.test(original)) return { ok: false, reason: 'transaction' };
  if (typeof body.expiresDate !== 'number' || !Number.isFinite(body.expiresDate)) return { ok: false, reason: 'transaction' };
  const revoked = typeof body.revocationDate === 'number' && Number.isFinite(body.revocationDate);
  const expiresAt = new Date(body.expiresDate).toISOString();
  let status: SubscriptionStatus = 'active';
  if (revoked) status = 'revoked';
  else if (body.expiresDate <= now) status = 'expired';
  const isTrial = !revoked && body.expiresDate > now && (
    body.offerDiscountType === 'FREE_TRIAL' || (body.offerType === 1 && body.offerDiscountType == null)
  );
  return {
    ok: true,
    subscription: {
      originalTransactionId: original,
      productId: body.productId,
      status,
      expiresAt,
      isTrial,
      environment: body.environment as StoreEnvironment,
    },
  };
}

export function applyServerNotification(
  subscription: VerifiedSubscription,
  notificationType: string,
  subtype: string | null,
): VerifiedSubscription {
  if (subscription.status === 'revoked' && notificationType !== 'REFUND_REVERSED') return subscription;
  if (notificationType === 'REFUND' || notificationType === 'REVOKE') {
    return { ...subscription, status: 'revoked', isTrial: false };
  }
  if (notificationType === 'EXPIRED' || notificationType === 'GRACE_PERIOD_EXPIRED') {
    return { ...subscription, status: 'expired', isTrial: false };
  }
  if (notificationType === 'DID_FAIL_TO_RENEW') {
    if (subscription.status === 'expired' || subscription.status === 'revoked') return subscription;
    return { ...subscription, status: subtype === 'GRACE_PERIOD' ? 'grace' : 'billing_retry' };
  }
  if (notificationType === 'DID_CHANGE_RENEWAL_STATUS' && subtype === 'AUTO_RENEW_DISABLED') {
    if (subscription.status === 'active') return { ...subscription, status: 'cancelled' };
    return subscription;
  }
  if (notificationType === 'DID_CHANGE_RENEWAL_STATUS' && subtype === 'AUTO_RENEW_ENABLED' && subscription.status === 'cancelled') {
    return { ...subscription, status: 'active' };
  }
  return subscription;
}

export type NotificationRead =
  | { ok: true; kind: 'test' }
  | { ok: true; kind: 'transaction'; notificationType: string; subtype: string | null; signedTransactionInfo: string }
  | { ok: false; reason: 'claims' | 'bundle' | 'app' };

export function readNotificationClaims(payload: unknown): NotificationRead {
  const body = asRecord(payload);
  if (!body || typeof body.notificationType !== 'string') return { ok: false, reason: 'claims' };
  if (body.notificationType === 'TEST') return { ok: true, kind: 'test' };
  const data = asRecord(body.data);
  if (!data) return { ok: false, reason: 'claims' };
  if (data.bundleId !== BUNDLE_ID) return { ok: false, reason: 'bundle' };
  if (data.appAppleId != null && Number(data.appAppleId) !== APPLE_APP_ID) return { ok: false, reason: 'app' };
  const signed = data.signedTransactionInfo;
  if (typeof signed !== 'string' || !signed.includes('.')) return { ok: false, reason: 'claims' };
  const subtype = typeof body.subtype === 'string' ? body.subtype : null;
  return { ok: true, kind: 'transaction', notificationType: body.notificationType, subtype, signedTransactionInfo: signed };
}
