import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Without this, the `@/…` alias from tsconfig is invisible to Vitest, so any
 * test touching a module that imports by alias fails to resolve. Tests that
 * only used relative imports happened to work, which hid the gap.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
