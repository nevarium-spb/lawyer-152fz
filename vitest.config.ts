import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', 'packages/*/src/index.ts'],
      // Пороги из PLAN.md: core и rules — 90 %, остальные пакеты — 80 %.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'packages/{core,rules}/src/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
