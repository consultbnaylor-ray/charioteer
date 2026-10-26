import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function runShipCheck(profile: string | undefined) {
  const script = join(process.cwd(), 'scripts/assert-patches.mjs');
  const env = { ...process.env };
  if (profile === undefined) delete env.EXPO_PUBLIC_BUILD_PROFILE;
  else env.EXPO_PUBLIC_BUILD_PROFILE = profile;
  return spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
}

describe('store speech gate', () => {
  it('exits 1 for a store profile while the ducking gate is false', () => {
    const result = runShipCheck('store');
    expect(result.status, result.stderr).toBe(1);
    expect(`${result.stderr}`).toContain('Store profile target');
  });

  it('exits 1 when the build profile is missing', () => {
    const result = runShipCheck(undefined);
    expect(result.status, result.stderr).toBe(1);
    expect(`${result.stderr}`).toContain('EXPO_PUBLIC_BUILD_PROFILE is missing');
  });

  it('exits 1 when the build profile is unknown', () => {
    const result = runShipCheck('preview');
    expect(result.status, result.stderr).toBe(1);
    expect(`${result.stderr}`).toContain('EXPO_PUBLIC_BUILD_PROFILE is unknown');
  });

  it('passes ship-check for an explicit testflight profile while the gate is false', () => {
    const result = runShipCheck('testflight');
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(`${result.stdout}`).toContain('EXPO_PUBLIC_BUILD_PROFILE=testflight keeps speech');
  });
});
