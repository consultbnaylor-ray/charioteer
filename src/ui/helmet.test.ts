import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HELMET_BODY, HELMET_WING_LEFT, HELMET_WING_RIGHT } from './helmet';

const svg = readFileSync(resolve(process.cwd(), 'assets/brand/helmet.svg'), 'utf8');

describe('helmet mark', () => {
  it('uses one monochrome fill and the shared paths', () => {
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain(HELMET_WING_LEFT);
    expect(svg).toContain(HELMET_WING_RIGHT);
    expect(svg).toContain(HELMET_BODY);
    expect(svg).toContain('fill-rule="evenodd"');
  });
});
