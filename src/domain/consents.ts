export const CONSENT_KINDS = ['age_18', 'health', 'community', 'ai_coach'] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

export type StoredConsent = {
  kind: ConsentKind;
  granted: boolean;
  version: string;
};

export function hasCurrentConsents(rows: readonly { kind: string; version: string }[], version: string): boolean {
  const present = new Set(rows.filter((row) => row.version === version).map((row) => row.kind));
  return CONSENT_KINDS.every((kind) => present.has(kind));
}

export function consentRows(
  version: string,
  input: { consentHealth: boolean; communityVisible: boolean; consentAi: boolean },
): StoredConsent[] {
  return [
    { kind: 'age_18', granted: true, version },
    { kind: 'health', granted: input.consentHealth, version },
    { kind: 'community', granted: input.communityVisible, version },
    { kind: 'ai_coach', granted: input.consentAi, version },
  ];
}

/** Rows that are not already stored for this version. A second save inserts nothing new. */
export function missingConsentRows(existing: readonly { kind: string; version: string }[], next: readonly StoredConsent[]): StoredConsent[] {
  const present = new Set(existing.filter((row) => row.version === next[0]?.version).map((row) => row.kind));
  return next.filter((row) => !present.has(row.kind));
}
