import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolves the `@/*` alias from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // `server-only` throws when imported outside a server component; under
    // Vitest every module is plain Node, so it is stubbed out.
    alias: { 'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url).pathname },
  },
});
