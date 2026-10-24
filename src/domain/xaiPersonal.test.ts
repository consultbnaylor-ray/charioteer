import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ensureSafetyNotices } from './safety';
import {
  COACHING_PAUSED,
  COACHING_PAUSED_SAVED,
  coachingPersonalDataAllowed,
  pausedCoachingMessage,
  readInterimCoachOptIn,
  xaiInterimOptInAllowed,
  xaiPersonalDataEnabled,
} from '../../supabase/functions/_shared/xaiPersonal';

function handler(path: string): string {
  const source = readFileSync(path, 'utf8');
  return source.slice(source.indexOf('Deno.serve'));
}

const calm = { selfHarm: false, withdrawal: false, reasons: [] as string[] };
const crisis = { selfHarm: true, withdrawal: false, reasons: ['self-harm or suicidal language'] };

describe('xAI personal-data switch', () => {
  it('stays on unless the server value is false', () => {
    expect(xaiPersonalDataEnabled(undefined)).toBe(true);
    expect(xaiPersonalDataEnabled(null)).toBe(true);
    expect(xaiPersonalDataEnabled('')).toBe(true);
    expect(xaiPersonalDataEnabled('   ')).toBe(true);
    expect(xaiPersonalDataEnabled('true')).toBe(true);
    expect(xaiPersonalDataEnabled('TRUE')).toBe(true);
    expect(xaiPersonalDataEnabled('false')).toBe(false);
    expect(xaiPersonalDataEnabled('FALSE')).toBe(false);
    expect(xaiPersonalDataEnabled(' false ')).toBe(false);
  });

  it('opens the interim path only for the exact word true', () => {
    expect(xaiInterimOptInAllowed(undefined)).toBe(false);
    expect(xaiInterimOptInAllowed(null)).toBe(false);
    expect(xaiInterimOptInAllowed('')).toBe(false);
    expect(xaiInterimOptInAllowed('false')).toBe(false);
    expect(xaiInterimOptInAllowed('yes')).toBe(false);
    expect(xaiInterimOptInAllowed(' true ')).toBe(true);
    expect(xaiInterimOptInAllowed('TRUE')).toBe(true);
  });

  it('lets a person through a closed kill switch only when both gates are exactly true', () => {
    const closed = { personalDataFlag: 'false', interimFlag: 'true', userOptIn: true };
    expect(coachingPersonalDataAllowed(closed)).toBe(true);
    expect(coachingPersonalDataAllowed({ ...closed, interimFlag: undefined })).toBe(false);
    expect(coachingPersonalDataAllowed({ ...closed, interimFlag: 'false' })).toBe(false);
    expect(coachingPersonalDataAllowed({ ...closed, userOptIn: false })).toBe(false);
    expect(coachingPersonalDataAllowed({ ...closed, userOptIn: undefined })).toBe(false);
    expect(coachingPersonalDataAllowed({ ...closed, userOptIn: null })).toBe(false);
    expect(coachingPersonalDataAllowed({ ...closed, userOptIn: 'true' })).toBe(false);
    expect(coachingPersonalDataAllowed({ personalDataFlag: undefined, interimFlag: undefined, userOptIn: undefined })).toBe(true);
    expect(coachingPersonalDataAllowed({ personalDataFlag: 'false', interimFlag: 'true', userOptIn: true })).toBe(true);
  });

  it('treats a missing or failed read of the choice as not opted in', async () => {
    const reader = (result: { data: Record<string, unknown> | null; error: unknown } | 'throw') => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => result === 'throw' ? Promise.reject(new Error('down')) : Promise.resolve(result),
          }),
        }),
      }),
    });
    expect(await readInterimCoachOptIn(reader({ data: null, error: { message: 'column missing' } }), 'u')).toBeUndefined();
    expect(await readInterimCoachOptIn(reader({ data: {}, error: null }), 'u')).toBeUndefined();
    expect(await readInterimCoachOptIn(reader({ data: { consent_xai_interim: false }, error: null }), 'u')).toBe(false);
    expect(await readInterimCoachOptIn(reader({ data: { consent_xai_interim: true }, error: null }), 'u')).toBe(true);
    expect(await readInterimCoachOptIn(reader('throw'), 'u')).toBeUndefined();
  });

  it('keeps the waiting sentence short enough for voice, and names the wait', () => {
    expect(COACHING_PAUSED).toContain("won't save your data");
    expect(COACHING_PAUSED).toContain('Everything else in the app still works.');
    expect(COACHING_PAUSED.length).toBeLessThan(180);
    expect(COACHING_PAUSED_SAVED.length).toBeLessThan(180);
    expect(COACHING_PAUSED_SAVED).toContain('Nothing was sent.');
    expect(pausedCoachingMessage(true)).toBe(COACHING_PAUSED_SAVED);
    expect(pausedCoachingMessage(false)).toBe(COACHING_PAUSED);
    expect(pausedCoachingMessage(undefined)).toBe(COACHING_PAUSED);
    expect(COACHING_PAUSED).not.toMatch(/XAI_|kill switch|opt-in/i);
    expect(COACHING_PAUSED_SAVED).not.toMatch(/XAI_|kill switch|opt-in/i);
  });

  it('adds 116 123 and 999 to a paused crisis reply, and leaves a calm pause alone', () => {
    const shown = ensureSafetyNotices(pausedCoachingMessage(false), crisis);
    expect(shown.startsWith(COACHING_PAUSED)).toBe(true);
    expect(shown).toContain('116 123');
    expect(shown).toContain('999');
    const optedIn = ensureSafetyNotices(pausedCoachingMessage(true), crisis);
    expect(optedIn).toContain('116 123');
    expect(optedIn).toContain('999');
    expect(optedIn.startsWith(COACHING_PAUSED_SAVED)).toBe(true);
    expect(ensureSafetyNotices(COACHING_PAUSED, calm)).toBe(COACHING_PAUSED);
  });

  it('stops personal context before each xAI call and leaves the health ping alone', () => {
    const chat = handler('supabase/functions/thumos-chat/index.ts');
    const voice = handler('supabase/functions/thumos-voice-token/index.ts');
    const plan = handler('supabase/functions/health-plan/index.ts');
    const meal = handler('supabase/functions/estimate-meal/index.ts');
    const reflect = handler('supabase/functions/gratitude-reflect/index.ts');
    const ping = readFileSync('supabase/functions/thumos-health/index.ts', 'utf8');

    expect(chat.indexOf('coachingPersonalDataAllowed')).toBeGreaterThan(-1);
    expect(chat.indexOf('coachingPersonalDataAllowed')).toBeLessThan(chat.indexOf('runThumosModelChain'));
    expect(chat).toContain("Deno.env.get('XAI_PERSONAL_DATA_ENABLED')");
    expect(chat).toContain("Deno.env.get('XAI_INTERIM_OPT_IN_ALLOWED')");
    expect(chat).toContain('userOptIn: profile.consent_xai_interim');
    expect(chat).toContain('else if (!apiKey)');
    const paused = chat.slice(chat.indexOf('if (!personalDataEnabled)'), chat.indexOf('else if (!apiKey)'));
    expect(paused).toContain('ensureSafetyNotices(pausedCoachingMessage(profile.consent_xai_interim), safety)');
    expect(paused).not.toContain('reply = COACHING_PAUSED;');

    expect(voice.indexOf('coachingPersonalDataAllowed')).toBeGreaterThan(voice.indexOf('consent_ai'));
    expect(voice.indexOf('if (!personalDataEnabled)')).toBeLessThan(voice.indexOf('buildVoiceBriefing'));
    expect(voice.indexOf('if (!personalDataEnabled)')).toBeLessThan(voice.indexOf('clientSecretUrl'));
    expect(voice).toContain('pausedCoachingMessage');
    expect(voice).toContain("Deno.env.get('XAI_INTERIM_OPT_IN_ALLOWED')");

    expect(plan.indexOf('coachingPersonalDataAllowed')).toBeLessThan(plan.indexOf('completionsUrl'));
    expect(plan).toContain('readInterimCoachOptIn');
    expect(meal.indexOf('coachingPersonalDataAllowed')).toBeLessThan(meal.indexOf('completionsUrl'));
    expect(meal.indexOf('readInterimCoachOptIn')).toBeLessThan(meal.indexOf('image_url'));
    expect(reflect.indexOf('coachingPersonalDataAllowed')).toBeLessThan(reflect.indexOf('completionsUrl'));
    expect(reflect.indexOf('readInterimCoachOptIn')).toBeLessThan(reflect.indexOf('gratitudeReflectMessages'));

    expect(ping).not.toContain('xaiPersonalDataEnabled');
    expect(ping).not.toContain('coachingPersonalDataAllowed');
    expect(ping).toContain('max_tokens: 1');
  });
});
