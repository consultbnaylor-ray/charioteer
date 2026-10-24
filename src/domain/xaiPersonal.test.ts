import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { COACHING_PAUSED, xaiPersonalDataEnabled } from '../../supabase/functions/_shared/xaiPersonal';

function handler(path: string): string {
  const source = readFileSync(path, 'utf8');
  return source.slice(source.indexOf('Deno.serve'));
}

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
    expect(COACHING_PAUSED).toBe('Coaching is paused. Your personal details were not sent.');
  });

  it('stops personal context before each xAI call and leaves the health ping alone', () => {
    const chat = handler('supabase/functions/thumos-chat/index.ts');
    const voice = handler('supabase/functions/thumos-voice-token/index.ts');
    const plan = handler('supabase/functions/health-plan/index.ts');
    const meal = handler('supabase/functions/estimate-meal/index.ts');
    const reflect = handler('supabase/functions/gratitude-reflect/index.ts');
    const ping = readFileSync('supabase/functions/thumos-health/index.ts', 'utf8');

    expect(chat.indexOf('xaiPersonalDataEnabled')).toBeGreaterThan(-1);
    expect(chat.indexOf('xaiPersonalDataEnabled')).toBeLessThan(chat.indexOf('runThumosModelChain'));
    expect(chat).toContain('COACHING_PAUSED');
    expect(chat).toContain('else if (!apiKey)');

    expect(voice.indexOf('xaiPersonalDataEnabled')).toBeGreaterThan(voice.indexOf('consent_ai'));
    expect(voice.indexOf('xaiPersonalDataEnabled')).toBeLessThan(voice.indexOf('buildVoiceBriefing'));
    expect(voice.indexOf('xaiPersonalDataEnabled')).toBeLessThan(voice.indexOf('clientSecretUrl'));
    expect(voice).toContain('COACHING_PAUSED');

    expect(plan.indexOf('xaiPersonalDataEnabled')).toBeLessThan(plan.indexOf('completionsUrl'));
    expect(meal.indexOf('xaiPersonalDataEnabled')).toBeLessThan(meal.indexOf('completionsUrl'));
    expect(meal.indexOf('xaiPersonalDataEnabled')).toBeLessThan(meal.indexOf('image_url'));
    expect(reflect.indexOf('xaiPersonalDataEnabled')).toBeLessThan(reflect.indexOf('completionsUrl'));
    expect(reflect.indexOf('xaiPersonalDataEnabled')).toBeLessThan(reflect.indexOf('gratitudeReflectMessages'));

    expect(ping).not.toContain('xaiPersonalDataEnabled');
    expect(ping).toContain('max_tokens: 1');
  });
});
