import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { mealProviderResult, providerHttpOutage, type MealProviderFault } from './mealProvider.ts';

const PHOTO_OUTAGES: MealProviderFault[] = [
  { kind: 'missing_key' },
  { kind: 'timeout' },
  { kind: 'network' },
  { kind: 'http', status: 401 },
  { kind: 'http', status: 402 },
  { kind: 'http', status: 403 },
  { kind: 'http', status: 500 },
  { kind: 'http', status: 503 },
];

describe('meal provider failures', () => {
  it('treats every provider outage as one calm ai_unavailable', () => {
    expect(providerHttpOutage(401)).toBe(true);
    expect(providerHttpOutage(402)).toBe(true);
    expect(providerHttpOutage(403)).toBe(true);
    expect(providerHttpOutage(429)).toBe(true);
    expect(providerHttpOutage(500)).toBe(true);
    expect(providerHttpOutage(599)).toBe(true);
    expect(providerHttpOutage(400)).toBe(false);
    expect(providerHttpOutage(422)).toBe(false);
    expect(providerHttpOutage(200)).toBe(false);

    for (const fault of PHOTO_OUTAGES) {
      expect(mealProviderResult(true, fault)).toEqual({
        outcome: 'unavailable',
        status: 503,
        code: 'ai_unavailable',
      });
    }
    expect(mealProviderResult(true, { kind: 'http', status: 429 })).toEqual({
      outcome: 'unavailable',
      status: 503,
      code: 'ai_unavailable',
    });
    expect(mealProviderResult(true, { kind: 'http', status: 400 }).outcome).toBe('unavailable');
  });

  it('keeps unread for a photo the model answered with unusable text', () => {
    expect(mealProviderResult(true, { kind: 'unparsed' })).toEqual({
      outcome: 'unread',
      status: 422,
      code: 'unread',
    });
    for (const fault of PHOTO_OUTAGES) {
      expect(mealProviderResult(true, fault).outcome).not.toBe('unread');
    }
  });

  it('keeps a text estimate and flags only a provider failure', () => {
    for (const fault of [...PHOTO_OUTAGES, { kind: 'http', status: 429 } as MealProviderFault]) {
      expect(mealProviderResult(false, fault)).toEqual({
        outcome: 'local',
        providerUnavailable: true,
      });
    }
    expect(mealProviderResult(false, { kind: 'unparsed' })).toEqual({
      outcome: 'local',
      providerUnavailable: false,
    });
  });

  it('wires estimate-meal to that mapping and does not log the body, the key, or the photo', () => {
    const live = readFileSync('supabase/functions/estimate-meal/index.ts', 'utf8');
    expect(live).toContain('mealProviderResult');
    expect(live).toContain('AI_UNAVAILABLE_CODE');
    expect(live).toContain('providerUnavailable: true');
    expect(live).toContain('PHOTO_READ_FAIL');
    expect(live).toContain("warnMeal(`http ${response.status}`)");
    expect(live).toContain("? 'timeout' : 'http'");
    const logged = live.split('\n').filter((line) => /console\.(log|warn|error)/.test(line));
    expect(logged.join('\n')).not.toMatch(/apiKey|imageBase64|response\.(text|json)|Bearer|XAI_API_KEY/);
  });
});
