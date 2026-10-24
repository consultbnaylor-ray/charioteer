import path from 'node:path';

import { defineConfig } from 'vitest/config';

/** Server consent tests. The app suite stays on the root config. */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['supabase/functions/_shared/**/*.test.ts'],
  },
});
