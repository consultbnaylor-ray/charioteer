import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

describe('native API safety', () => {
  it('does not call web-only globals from the app', () => {
    const sources = files('src').filter((path) => !path.endsWith('.test.ts'));
    const problems: string[] = [];
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      if (/crypto\.randomUUID/.test(source)) problems.push(`${path} calls crypto.randomUUID`);
      if (/\blocalStorage\b/.test(source)) problems.push(`${path} uses localStorage`);
      if (/\bstructuredClone\b/.test(source)) problems.push(`${path} uses structuredClone`);
      if (/\bnew Buffer\b|\bBuffer\.from\b/.test(source)) problems.push(`${path} uses Buffer`);
      if (/\bnew TextEncoder\b/.test(source)) problems.push(`${path} uses TextEncoder`);
      if (/\bnew TextDecoder\b/.test(source) && !source.includes('typeof TextDecoder')) {
        problems.push(`${path} uses TextDecoder without a guard`);
      }
      if (/\b(?:window|document)\./.test(source) && !/Platform\.OS === 'web'|typeof window|typeof document/.test(source)) {
        problems.push(`${path} uses window or document without a web guard`);
      }
    }
    expect(problems).toEqual([]);
  });
});
