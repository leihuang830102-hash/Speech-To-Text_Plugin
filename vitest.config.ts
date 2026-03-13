import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/integration/**/*.test.js'],
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './tests/results/vitest-results.json'
    },
    env: {
      KMP_DUPLICATE_LIB_OK: 'TRUE'
    }
  }
});
