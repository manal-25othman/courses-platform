import { defineConfig } from 'vitest/config';

/**
 * Tests that need a real database.
 *
 * Kept separate from the unit tests so `npm test` stays fast and needs no
 * PostgreSQL, while CI runs these against a real one.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.spec.ts'],
    // The row-level policies are shared state, so these run one at a time.
    fileParallelism: false,
  },
});
