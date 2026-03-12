import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './tests/results/vitest-results.json'
    },
    env: {
      KMP_DUPLICATE_LIB_OK: 'TRUE'
    }
  }
});
