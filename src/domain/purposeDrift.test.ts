import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_SHARE } from '@/health/connection';
import { LOCATION_WHEN_IN_USE } from '@/domain/outdoorRoute';

const BANNED = [
  'not tracked in the ' + 'background',
  'Locking the phone ' + 'pauses',
];

function filesUnder(dir: string, into: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'deno.lock') continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) filesUnder(path, into);
    else if (/\.(ts|tsx|js|json|md|html|plist|patch|swift|m)$/.test(name) && !name.endsWith('.test.ts')) into.push(path);
  }
  return into;
}

describe('purpose strings stay on the approved text', () => {
  it('fails if the withdrawn foreground phrases remain in the app, the docs, or the source', () => {
    const paths = ['app.json', ...filesUnder('docs'), ...filesUnder('src'), ...filesUnder('patches')];
    const hits: string[] = [];
    for (const path of paths) {
      const text = readFileSync(path, 'utf8');
      for (const phrase of BANNED) {
        if (text.includes(phrase)) hits.push(`${path}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('puts the approved location sentence in the five required places', () => {
    for (const path of [
      'app.json',
      'src/domain/outdoorRoute.ts',
      'docs/privacy.md',
      'docs/privacy.html',
      'docs/dpia-location.md',
    ]) {
      expect(readFileSync(path, 'utf8'), path).toContain(LOCATION_WHEN_IN_USE);
    }
  });

  it('keeps the Health share sentence, a foreground read, and the speech gate', () => {
    const app = readFileSync('app.json', 'utf8');
    expect(app).toContain(APPLE_HEALTH_SHARE);
    expect(app.match(/NSHealthShareUsageDescription/g)).toHaveLength(2);
    expect(app).not.toContain('com.apple.developer.healthkit.background-delivery');
    expect(app).toContain('"background": false');
    const heart = readFileSync('src/health/liveReading.ios.ts', 'utf8');
    expect(heart).toContain('queryQuantitySamplesWithAnchor');
    expect(heart).toContain('subscribeToChanges');
    expect(heart).not.toContain('enableBackgroundDelivery');
    expect(heart).not.toMatch(/export_my_data|sobriety_started_at|check-ins/);
    expect(readFileSync('src/activity/summaries.ts', 'utf8')).not.toMatch(/bpm|latitude|heart/);
    const patch = readFileSync('patches/expo-location+57.0.22.patch', 'utf8');
    expect(patch).toContain('allowsBackgroundLocationUpdates = true');
    expect(patch).toContain('activityType == 3');
    expect(patch).not.toContain('startMonitoringSignificantLocationChanges');
    expect(APPLE_HEALTH_SHARE).not.toContain('including while the phone is locked');
    expect(app).not.toContain('including while the phone is locked');
    expect(APPLE_HEALTH_SHARE).toContain('the latest heart rate from Apple Health can be shown on that screen.');
    const dpia = readFileSync('docs/dpia-location.md', 'utf8');
    expect(dpia).toContain('Approved by Ben on 26 October 2026');
    expect(dpia).toContain('re-approved by Ben on 26 October 2026');
    expect(dpia).toContain('Audio is used only for Thumos spoken lines when the person picks spoken updates.');
    const battery = 'A finer location fix, about 10 metres, uses more battery than a coarse one. It stops when you tap Stop, or after six hours.';
    expect(dpia).toContain('Good to know battery line, approved by Ben on 26 October 2026, as written: "' + battery + '"');
    expect(readFileSync('docs/start-activity-decisions.md', 'utf8')).toContain('Ben approved the Good to know battery line on 26 October 2026, as written: "' + battery + '"');
    expect(readFileSync('docs/start-activity-decisions.md', 'utf8')).not.toContain('battery line that Ben has not approved');
    expect(readFileSync('src/domain/activitySession.ts', 'utf8')).toContain('Approved by Ben on 26 October 2026');
    expect(readFileSync('docs/store-privacy-labels.md', 'utf8')).toContain('Approved by Ben on 26 October 2026, in build 74, not shipped');
    expect(readFileSync('docs/store-privacy-labels.md', 'utf8')).toContain('Audio is used only for Thumos spoken lines when the person picks spoken updates.');
    const gate = 'App Store submission is blocked until a real phone shows music ducks, then returns to full volume after each line, with no leftover audio session, including a phone call and Bluetooth headphones.';
    expect(readFileSync('docs/start-activity-decisions.md', 'utf8')).toContain(gate);
    expect(readFileSync('docs/app-store-activity-review.md', 'utf8')).toContain(gate);
    expect(readFileSync('docs/app-store-activity-review.md', 'utf8')).toContain('While Using');
    expect(readFileSync('docs/privacy.md', 'utf8')).toContain('on-device text to speech');
    expect(readFileSync('docs/privacy.md', 'utf8')).toContain('No live-tracking route is sent to HeiGIT');
  });
});
