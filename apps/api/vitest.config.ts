import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The curriculum extractor lives in tooling/ but is part of what this
    // package's import script runs, so its guard belongs in the same suite.
    include: ['src/**/*.spec.ts', '../../tooling/**/*.spec.ts'],
  },
});
