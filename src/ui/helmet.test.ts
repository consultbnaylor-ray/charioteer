import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HELMET_D } from './helmet';

describe('helmet mark', () => {
  it('keeps the traced concept in the source SVG', () => {
    const source = readFileSync(resolve(process.cwd(), 'assets/brand/helmet.svg'), 'utf8');
    expect(source).toContain('fill="currentColor"');
    expect(source).toContain('fill-rule="nonzero"');
    expect(source).toContain(HELMET_D);
  });
});
