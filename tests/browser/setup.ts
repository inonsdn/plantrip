/**
 * The real stylesheet, so a layout assertion means something.
 *
 * Without it every utility class is inert: a row with no CSS never overflows,
 * a touch target is whatever the browser's default button happens to be, and a
 * test that checks either one passes for the wrong reason. Vite runs it through
 * the project's own PostCSS, so these are the same utilities the app ships.
 */
import '@/app/globals.css';

/**
 * `next/link` reads `process.env` while its module is evaluating. Next supplies
 * that in its own build; a bare browser does not, and the import throws before
 * any test runs. Anything reaching a Next component through a shared UI module
 * — `@/components/ui/button` exports both a plain button and a link one — trips
 * over it, so the shim lives here rather than in each test.
 *
 * Reached through a cast rather than a global declaration: `@types/node`
 * already declares `process`, and redeclaring it would fight that everywhere.
 */
const scope = globalThis as unknown as {
  process?: { env: Record<string, string | undefined> };
};

scope.process ??= { env: { NODE_ENV: 'test' } };

export {};
