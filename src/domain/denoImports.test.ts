import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('edge function imports', () => {
  it('uses a .ts suffix on every relative import so Deno can deploy them', () => {
    const offenders: string[] = [];
    for (const path of files('supabase/functions')) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        if (!match[1].endsWith('.ts')) offenders.push(`${path} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
