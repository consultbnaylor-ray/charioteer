import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { randomId } from './id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('randomId', () => {
  it('returns a UUID when the global crypto object is missing', () => {
    const previous = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => randomId()).not.toThrow();
      expect(randomId()).toMatch(UUID);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: previous, configurable: true });
    }
  });

  it('does not call randomUUID on an undefined crypto global', () => {
    const sources = [
      'src/data/supabase-repository.ts',
      'src/data/demo-repository.ts',
      'src/domain/id.ts',
    ];
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toContain('crypto.randomUUID');
    }
  });
});
