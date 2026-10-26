import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('store speech gate', () => {
  it('exits 1 for a store profile while the ducking gate is false', () => {
    const script = join(process.cwd(), 'scripts/assert-patches.mjs');
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, EXPO_PUBLIC_BUILD_PROFILE: 'store' },
    });
    expect(result.status, result.stderr).toBe(1);
    expect(`${result.stderr}`).toContain('Store profile target');
  });
});
