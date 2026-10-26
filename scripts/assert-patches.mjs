#!/usr/bin/env node
/**
 * Fail the ship if any file in patches/ is missing from node_modules.
 * A reverse dry-run succeeds only when the patch is already applied.
 * This check does not apply patches. Run npm install so postinstall can.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const dir = join(root, 'patches');
let names = [];
try {
  names = readdirSync(dir).filter((name) => name.endsWith('.patch')).sort();
} catch {
  console.error('patches/ is missing. The ship check cannot confirm node_modules.');
  process.exit(1);
}
if (names.length === 0) {
  console.error('No patch files in patches/.');
  process.exit(1);
}

const missing = [];
for (const name of names) {
  const result = spawnSync('patch', [
    '-p1',
    '--dry-run',
    '--reverse',
    '--forward',
    '--batch',
    '-i',
    join('patches', name),
  ], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    missing.push(name);
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim();
    console.error(`${name} is not applied.`);
    if (detail) console.error(detail);
  }
}

if (missing.length > 0) {
  console.error('A patch is missing from node_modules. Run npm install so postinstall can apply it. This check does not apply patches.');
  process.exit(1);
}

const health = names.find((name) => name.includes('react-native-healthkit'));
if (health) {
  const text = readFileSync(join(dir, health), 'utf8');
  const banned = [
    'CharioteerRequestAuthorizationCatchingExceptions',
    'CharioteerGetRequestStatusCatchingExceptions',
    '@_silgen_name',
  ];
  for (const token of banned) {
    if (text.includes(token)) {
      console.error(`${health} still declares a C function for the HealthKit auth callback (${token}).`);
      process.exit(1);
    }
  }
  if (!text.includes('@interface CharioteerAuthCatcher : NSObject')) {
    console.error(`${health} is missing the CharioteerAuthCatcher class.`);
    process.exit(1);
  }
}

const pkgPath = join(root, 'package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const locationVersion = pkg.dependencies?.['expo-location'];
  if (locationVersion !== '57.0.22') {
    console.error(`expo-location must be pinned to 57.0.22. package.json has ${locationVersion}.`);
    process.exit(1);
  }
  if (!names.includes('expo-location+57.0.22.patch')) {
    console.error('patches/expo-location+57.0.22.patch is missing. The pin and the patch have to name the same version.');
    process.exit(1);
  }
}

const speechPath = join(root, 'src/activity/speakLine.ts');
const sheetPath = join(root, 'docs/start-activity-decisions.md');
const reviewPath = join(root, 'docs/app-store-activity-review.md');
if (existsSync(speechPath) && existsSync(sheetPath) && existsSync(reviewPath)) {
  const gate = 'App Store submission is blocked until a real phone shows music ducks, then returns to full volume after each line, with no leftover audio session, including a phone call and Bluetooth headphones.';
  const speech = readFileSync(speechPath, 'utf8');
  const sheet = readFileSync(sheetPath, 'utf8');
  const review = readFileSync(reviewPath, 'utf8');
  if (!sheet.includes(gate) || !review.includes(gate)) {
    console.error('The App Store speech ducking gate is missing from the decisions sheet or the review notes.');
    process.exit(1);
  }
  const gatePassed = /APP_STORE_SPEECH_DUCK_GATE_PASSED = true/.test(speech);
  const recorded = sheet.includes('Phone ducking test passed on') && review.includes('Phone ducking test passed on');
  if (gatePassed && !recorded) {
    console.error('APP_STORE_SPEECH_DUCK_GATE_PASSED is true, but the phone ducking test is not recorded in the sheet and the review notes.');
    process.exit(1);
  }
  if (!gatePassed) {
    console.log('NOTE: App Store submission is blocked until a real phone passes the speech ducking test. TestFlight speech is on.');
  }
}

console.log(`All ${names.length} patches are applied.`);
