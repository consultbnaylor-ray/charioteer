import { describe, expect, it } from 'vitest';

import { consentRows, hasCurrentConsents, missingConsentRows } from './consents';

const version = '2026-10-10';
const choice = { consentHealth: true, communityVisible: false, consentAi: true };

describe('current consents', () => {
  it('is missing until every kind exists for this version', () => {
    expect(hasCurrentConsents([], version)).toBe(false);
    expect(hasCurrentConsents([{ kind: 'age_18', version }], version)).toBe(false);
    expect(hasCurrentConsents(consentRows(version, choice), version)).toBe(true);
    expect(hasCurrentConsents(consentRows('2020-01-01', choice), version)).toBe(false);
  });

  it('inserts only the kinds that are not already stored', () => {
    const next = consentRows(version, choice);
    expect(missingConsentRows([], next)).toEqual(next);
    expect(missingConsentRows(next, next)).toEqual([]);
    expect(missingConsentRows([{ kind: 'age_18', version }], next).map((row) => row.kind)).toEqual(['health', 'community', 'ai_coach']);
  });
});
