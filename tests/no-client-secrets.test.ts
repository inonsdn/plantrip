import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const files = sourceFiles('src').map((path) => ({ path, source: readFileSync(path, 'utf8') }));
const clientFiles = files.filter(({ source }) => /^['"]use client['"]/m.test(source));

/**
 * The Supabase URL and anon key are server-only.
 *
 * They were once passed to the sign-in button as a prop, which put them in the
 * HTML of a public page. Anything that could fetch that page could read them
 * and call the REST API — row level security kept the data safe, but the
 * requests still cost CPU, and the project ended up pinned at 100%.
 */
describe('the Supabase project key never reaches the browser', () => {
  it('finds client components to check', () => {
    expect(clientFiles.length).toBeGreaterThan(5);
  });

  it('no client component reads the Supabase environment', () => {
    const offenders = clientFiles.filter(({ source }) =>
      /from\s+['"].*supabase\/env['"]|supabaseAnonKey|publicSupabaseConfig/.test(source),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('no client component builds a Supabase client', () => {
    const offenders = clientFiles.filter(({ source }) =>
      /createBrowserClient|createServerClient|@supabase\/ssr/.test(source),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('nothing hands the anon key out of a server module', () => {
    const offenders = files.filter(
      ({ path, source }) =>
        !path.endsWith('supabase/env.ts') &&
        !path.endsWith('supabase/server.ts') &&
        !path.endsWith('supabase/session.ts') &&
        /supabaseAnonKey/.test(source),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('keeps the environment module server-only', () => {
    const env = readFileSync('src/lib/supabase/env.ts', 'utf8');
    expect(env).toContain("import 'server-only'");
  });
});
