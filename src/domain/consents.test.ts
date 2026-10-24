import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import { CONSENT_VERSION } from '@/data/catalogue';
import { CONSENT_INTRO, CONSENT_KINDS, consentRows, hasCurrentConsents, interimConsentRows, mergeStoredConsents, missingConsentRows, TERMS_REQUIRED } from './consents';

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

  it('keeps the temporary Thumos choice off the other consents, and private', () => {
    expect(CONSENT_KINDS).not.toContain('xai_interim');
    expect(consentRows(version, choice).map((row) => row.kind)).not.toContain('xai_interim');
    expect(hasCurrentConsents(consentRows(version, choice), version)).toBe(true);
    const kept = mergeStoredConsents(
      [...consentRows(version, choice), ...interimConsentRows(version, true)],
      consentRows(version, { ...choice, consentAi: false }),
      '2026-10-24T12:00:00.000Z',
    );
    expect(kept.find((row) => row.kind === 'xai_interim')).toMatchObject({ granted: true, version });
    expect(kept.find((row) => row.kind === 'ai_coach')).toMatchObject({ granted: false });

    const choices = readFileSync('src/ui/ConsentChoices.tsx', 'utf8');
    const interimCopy = choices.slice(choices.indexOf('export const INTERIM_COACH_TITLE'), choices.indexOf('export function ConsentChoices'));
    expect(interimCopy).toContain('Temporary: continue before xAI confirms');
    expect(interimCopy).toContain('separate choice');
    expect(interimCopy).toContain('starts off');
    expect(interimCopy).toContain('has not yet confirmed in writing');
    expect(interimCopy).toContain('will not save');
    expect(interimCopy).toContain('messages you type');
    expect(interimCopy).toContain('your name');
    expect(interimCopy).toContain('reasons');
    expect(interimCopy).toContain('check-ins');
    expect(interimCopy).toContain('gratitude lines');
    expect(interimCopy).toContain('vision statement');
    expect(interimCopy).toContain('meal photo');
    expect(interimCopy).toContain('Garmin daily totals');
    expect(interimCopy).toContain('progress photos are not sent');
    expect(interimCopy).toContain('turn this off at any time');
    expect(choices.indexOf('title={INTERIM_COACH_TITLE}')).toBeGreaterThan(choices.indexOf('body={AI_COACH_CONSENT_BODY}'));
    expect(choices.indexOf('onChange={onInterim}')).toBeGreaterThan(choices.indexOf('onChange={onAi}'));

    const onboarding = readFileSync('src/app/onboarding.tsx', 'utf8');
    const consent = readFileSync('src/app/consent.tsx', 'utf8');
    const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const privacy = readFileSync('src/app/(main)/privacy.tsx', 'utf8');
    expect(onboarding).toContain('const [interim, setInterim] = useState(false)');
    expect(onboarding).not.toContain('setInterim(ai)');
    expect(onboarding).toContain('onInterim={changeInterim}');
    const finish = onboarding.slice(onboarding.indexOf('async function finish'), onboarding.indexOf('const catalogue'));
    expect(finish).not.toContain('interim');
    expect(finish).not.toContain('setInterimCoachOptIn');
    expect(consent).toContain('useState(profile?.consentXaiInterim === true)');
    expect(consent).toContain('const [ai, setAi] = useState(false)');
    expect(profile).toContain('useState(profile?.consentXaiInterim === true)');
    expect(profile).toContain('setInterimCoachOptIn');
    expect(privacy).toContain('setInterimCoachOptIn');
    const detailsSave = profile.slice(profile.indexOf('await repo.saveConsents'), profile.indexOf('if (messages)'));
    expect(detailsSave).not.toContain('interim');
    expect(detailsSave).not.toContain('consentXaiInterim');
    expect(readFileSync('src/app/(main)/thumos.tsx', 'utf8')).not.toContain('setInterimCoachOptIn');

    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const onboard = repo.slice(repo.indexOf('async completeOnboarding'), repo.indexOf('async updateProfile'));
    const persist = repo.slice(repo.indexOf('private async persistConsents'), repo.indexOf('private async persistProgress'));
    expect(onboard).not.toContain('consent_xai_interim');
    expect(persist).not.toContain('consent_xai_interim');
    expect(repo).toContain('consent_xai_interim: nextGranted');

    const migration = readFileSync('supabase/migrations/20261024140000_xai_interim_opt_in.sql', 'utf8');
    expect(migration).toContain('Not applied');
    expect(migration).toContain('consent_xai_interim boolean not null default false');
    expect(migration).toContain('grant update (consent_xai_interim) on public.profiles to authenticated');
    expect(migration).toContain("'xai_interim'");
    const statements = migration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    expect(statements).not.toContain('public_profile');
    expect(statements).not.toContain('directory');
    expect(statements).not.toContain('create table');
    expect(statements.toLowerCase()).not.toContain('grant select');
    expect(statements.toLowerCase()).not.toContain('grant all');
    const latestExport = readFileSync('supabase/migrations/20261023220000_garmin_wellness_summaries.sql', 'utf8');
    expect(latestExport).toContain("'profile', (select to_jsonb(p) from public.profiles p where p.id = uid)");
    expect(latestExport).toContain('from public.consents c where c.user_id = uid');
    expect(readFileSync('src/domain/profileSharing.ts', 'utf8')).not.toContain('consentXaiInterim');
    expect(readFileSync('src/ui/PublicProfileCard.tsx', 'utf8')).not.toContain('consentXaiInterim');
  });
});
