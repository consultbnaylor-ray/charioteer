import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import { CONSENT_VERSION } from '@/data/catalogue';
import { CONSENT_INTRO, consentRows, hasCurrentConsents, mergeStoredConsents, missingConsentRows, TERMS_REQUIRED } from './consents';

const version = '2026-10-21';
const choice = {
  consentHealth: true,
  communityVisible: false,
  consentAi: true,
  messageNotifications: false,
  termsAccepted: true,
};

describe('current consents', () => {
  it('is missing until every kind exists for this version', () => {
    expect(CONSENT_VERSION).toBe('2026-10-21');
    expect(hasCurrentConsents([], version)).toBe(false);
    expect(hasCurrentConsents([{ kind: 'age_18', version }], version)).toBe(false);
    expect(hasCurrentConsents(consentRows('2026-10-10', choice), version)).toBe(false);
    expect(hasCurrentConsents(consentRows(version, choice), version)).toBe(true);
    expect(hasCurrentConsents(consentRows('2020-01-01', choice), version)).toBe(false);
  });

  it('inserts only the kinds that are not already stored', () => {
    const next = consentRows(version, choice);
    expect(missingConsentRows([], next)).toEqual(next);
    expect(missingConsentRows(next, next)).toEqual([]);
    expect(missingConsentRows([{ kind: 'age_18', version }], next).map((row) => row.kind)).toEqual([
      'health',
      'community',
      'ai_coach',
      'message_notifications',
      'terms',
    ]);
  });

  it('stamps a withdrawal and leaves an unchanged choice on its earlier time', () => {
    const stored = consentRows(version, choice).map((row) => ({ ...row, decidedAt: '2026-10-21T09:00:00.000Z' }));
    const withdrawn = mergeStoredConsents(stored, consentRows(version, { ...choice, consentAi: false }), '2026-10-21T12:00:00.000Z');
    const coach = withdrawn.find((row) => row.kind === 'ai_coach');
    const health = withdrawn.find((row) => row.kind === 'health');
    expect(coach).toMatchObject({ granted: false, decidedAt: '2026-10-21T12:00:00.000Z', version });
    expect(health).toMatchObject({ granted: true, decidedAt: '2026-10-21T09:00:00.000Z' });
  });

  it('starts the three processing choices unticked and keeps terms separate', () => {
    const onboarding = readFileSync('src/app/onboarding.tsx', 'utf8');
    const consent = readFileSync('src/app/consent.tsx', 'utf8');
    const choices = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');
    const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(onboarding).toContain('const [health, setHealth] = useState(false)');
    expect(onboarding).toContain('const [ai, setAi] = useState(false)');
    expect(onboarding).toContain('const [messages, setMessages] = useState(false)');
    expect(onboarding).toContain('const [terms, setTerms] = useState(false)');
    expect(onboarding).toContain('TERMS_REQUIRED');
    expect(onboarding).toContain('CONSENT_INTRO');
    expect(onboarding).not.toContain('What may we keep');
    expect(consent).toContain('intro={CONSENT_INTRO}');
    expect(consent).not.toContain('What may we keep');
    expect(CONSENT_INTRO).toBe('We only use your details for the function of the app. We never share your information with third parties for marketing purposes. However, we need your permission for the following:');
    expect(readFileSync('src/app/(main)/privacy.tsx', 'utf8')).toContain('title="Privacy & consent"');
    expect(consent).toContain('const [health, setHealth] = useState(false)');
    expect(consent).toContain('const [ai, setAi] = useState(false)');
    expect(consent).toContain('const [messages, setMessages] = useState(false)');
    expect(consent).toContain('profile?.communityVisible ?? false');
    expect(choices).toContain('Health data');
    expect(choices).toContain('processed in the app');
    expect(choices).toContain('personalised notifications via xAI');
    const lead = 'Your data is never shared with any party for marketing purposes, and we only use personal information for the functionality of the app.';
    expect(choices).toContain('export const AI_COACH_CONSENT_LEAD');
    expect(choices).toContain('body={AI_COACH_CONSENT_BODY}');
    expect(choices.indexOf(lead)).toBeLessThan(choices.indexOf('This covers Thumos'));
    expect(choices).toContain('sent to xAI to write a reply');
    expect(choices).toContain('This is not used for ads');
    expect(choices.slice(0, choices.indexOf('AI_COACH_CONSENT_LEAD'))).not.toContain(lead);
    expect(choices.indexOf('They are not used for ads')).toBeGreaterThan(-1);
    expect(choices.indexOf(lead)).toBe(choices.lastIndexOf(lead));
    expect(choices).toContain('Message notifications');
    expect(choices).toContain('title="Terms"');
    expect(TERMS_REQUIRED).toBe('Tick the terms to continue.');
    expect(profile).toContain('onAi={setAi}');
    expect(profile).toContain('onMessages={setMessages}');
    const sql = readFileSync('supabase/migrations/20261021210000_dpia_consent.sql', 'utf8');
    expect(sql).toContain("'message_notifications', 'terms'");
    expect(sql).toContain('decided_at timestamptz');
    expect(sql).toContain('grant update (granted, decided_at)');
    expect(sql).toContain('message_notifications set default false');
    expect(sql).toContain('Not applied from this repo');
  });
});
