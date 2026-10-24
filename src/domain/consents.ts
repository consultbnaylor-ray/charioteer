export const CONSENT_KINDS = ['age_18', 'health', 'community', 'ai_coach', 'message_notifications', 'terms'] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Kept out of CONSENT_KINDS so a missing row does not send anyone back through consent. */
export const INTERIM_COACH_KIND = 'xai_interim' as const;

export type StoredConsent = {
  kind: ConsentKind | typeof INTERIM_COACH_KIND;
  granted: boolean;
  version: string;
  /** When this version of the choice was last granted or withdrawn. */
  decidedAt?: string;
};

export type ConsentChoice = {
  consentHealth: boolean;
  communityVisible: boolean;
  consentAi: boolean;
  messageNotifications: boolean;
  termsAccepted: boolean;
};

export const TERMS_REQUIRED = 'Tick the terms to continue.';

export const CONSENT_INTRO =
  'We only use your details for the function of the app. We never share your information with third parties for marketing purposes. However, we need your permission for the following:';

export function hasCurrentConsents(rows: readonly { kind: string; version: string }[], version: string): boolean {
  const present = new Set(rows.filter((row) => row.version === version).map((row) => row.kind));
  return CONSENT_KINDS.every((kind) => present.has(kind));
}

export function consentRows(version: string, input: ConsentChoice): StoredConsent[] {
  return [
    { kind: 'age_18', granted: true, version },
    { kind: 'health', granted: input.consentHealth, version },
    { kind: 'community', granted: input.communityVisible, version },
    { kind: 'ai_coach', granted: input.consentAi, version },
    { kind: 'message_notifications', granted: input.messageNotifications, version },
    { kind: 'terms', granted: input.termsAccepted, version },
  ];
}

/** A separate row. Saving the other consents does not write this. */
export function interimConsentRows(version: string, granted: boolean): StoredConsent[] {
  return [{ kind: INTERIM_COACH_KIND, granted: granted === true, version }];
}

/** Rows that are not already stored for this version. A second save inserts nothing new. */
export function missingConsentRows(existing: readonly { kind: string; version: string }[], next: readonly StoredConsent[]): StoredConsent[] {
  const present = new Set(existing.filter((row) => row.version === next[0]?.version).map((row) => row.kind));
  return next.filter((row) => !present.has(row.kind));
}

/**
 * Insert a choice the first time, and stamp a new decision time when it is granted or withdrawn.
 * An unchanged choice keeps its earlier timestamp.
 */
export function mergeStoredConsents(existing: readonly StoredConsent[], next: readonly StoredConsent[], decidedAt: string): StoredConsent[] {
  const fresh = next.map((row) => ({ ...row, decidedAt }));
  const replaced = existing.map((row) => {
    const match = fresh.find((item) => item.kind === row.kind && item.version === row.version);
    if (!match || match.granted === row.granted) return row;
    return { ...row, granted: match.granted, decidedAt };
  });
  return [...replaced, ...missingConsentRows(replaced, fresh)];
}
