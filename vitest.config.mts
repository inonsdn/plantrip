import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const serverOnly = new URL('./tests/stubs/server-only.ts', import.meta.url).pathname;

export default defineConfig({
  resolve: {
    // Resolves the `@/*` alias from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          // `server-only` throws when imported outside a server component; under
          // Vitest every module is plain Node, so it is stubbed out.
          alias: { 'server-only': serverOnly },
        },
      },
      {
        // The queue is React, refs, storage and focus. None of that is provable
        // in Node: every bug it has shipped lived in how those fit together, not
        // in the logic each piece runs. These tests drive the real hook in a
        // real browser.
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.tsx'],
          setupFiles: ['./tests/browser/setup.ts'],
          alias: { 'server-only': serverOnly },
          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: {
                // This container ships Chromium already; the Playwright package
                // wants a build it does not have, and downloading one is
                // blocked. Point it at what is here.
                executablePath:
                  process.env.CHROMIUM_PATH ??
                  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
              },
            }),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
