import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { APP_DISPLAY_NAME, APP_FULL_NAME } from './appName';

describe('app name', () => {
  it('uses the health listing name and keeps the icon label short', () => {
    expect(APP_FULL_NAME).toBe('Charioteer Sober/Health Coach');
    expect(APP_DISPLAY_NAME).toBe('Charioteer');
    const app = JSON.parse(readFileSync('app.json', 'utf8')) as {
      expo: { name: string; ios: { bundleIdentifier: string; infoPlist: { CFBundleDisplayName: string } }; android: { package: string } };
    };
    expect(app.expo.name).toBe('Charioteer');
    expect(app.expo.ios.infoPlist.CFBundleDisplayName).toBe('Charioteer');
    expect(app.expo.ios.bundleIdentifier).toBe('uk.co.quanticalabs.charioteer');
    expect(app.expo.android.package).toBe('uk.co.quanticalabs.charioteer');

    const named = ['README.md', 'docs/privacy.md', 'docs/privacy.html', 'supabase/functions/_shared/thumos.ts'];
    const usingConstant = [
      'src/app/onboarding.tsx',
      'src/app/(main)/profile.tsx',
      'src/app/sign-in.tsx',
      'src/app/sign-up.tsx',
      'src/app/_layout.tsx',
    ];
    for (const file of [...named, ...usingConstant]) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('Charioteer Sober Coach');
    }
    for (const file of named) {
      expect(readFileSync(file, 'utf8'), file).toContain(APP_FULL_NAME);
    }
    for (const file of usingConstant) {
      expect(readFileSync(file, 'utf8'), file).toContain('APP_FULL_NAME');
    }
    const wordmark = readFileSync('src/ui/ui.tsx', 'utf8');
    expect(wordmark.slice(wordmark.indexOf('function Wordmark'), wordmark.indexOf('export function Mark'))).toContain('Charioteer');
    expect(wordmark).not.toContain(APP_FULL_NAME);
  });
});
