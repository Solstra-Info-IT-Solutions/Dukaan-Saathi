import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
      // `server-only` throws outside React Server Components; tests run modules directly.
      {
        find: 'server-only',
        replacement: fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
