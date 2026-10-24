/**
 * Whether a coach prompt may include personal lines.
 * Anything other than exactly true stays closed, including a missing profile.
 * Health readings also need the coach switch. The coach switch alone is not enough.
 */

export type CoachConsentInput = {
  consentAi?: boolean | null;
  consentHealth?: boolean | null;
};

export type CoachShare = {
  /** AI coach consent. Target weight may be included. */
  ai: boolean;
  /** Health-data consent. Activity totals and the weight reading may be included. */
  health: boolean;
};

export function coachConsentAllows(input?: CoachConsentInput | null): CoachShare {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ai: false, health: false };
  }
  const ai = input.consentAi === true;
  return { ai, health: ai && input.consentHealth === true };
}
