import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HELMET_ICON_PATHS, HELMET_PATHS } from './helmet';

function svg(name: string) {
  return readFileSync(resolve(process.cwd(), 'assets/brand', name), 'utf8');
}

describe('helmet mark', () => {
  it('keeps the detailed profile in the source SVG', () => {
    const source = svg('helmet.svg');
    expect(source).toContain('fill="currentColor"');
    expect(source).toContain('fill-rule="evenodd"');
    for (const path of HELMET_PATHS) expect(source).toContain(path.d);
  });

  it('keeps a simpler icon variant for small sizes', () => {
    const source = svg('helmet-icon.svg');
    expect(source).toContain('fill="currentColor"');
    expect(source).toContain('fill-rule="evenodd"');
    for (const path of HELMET_ICON_PATHS) expect(source).toContain(path.d);
  });
});
