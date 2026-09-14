import 'server-only';

/**
 * Supabase configuration.
 *
 * Both naming conventions are accepted, `NEXT_PUBLIC_*` first:
 *   NEXT_PUBLIC_SUPABASE_URL      | SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY | SUPABASE_ANON_KEY
 *
 * Every lookup below references `process.env.X` literally. Next.js only inlines
 * statically written references, so a dynamic `process.env[name]` would read as
 * undefined inside the proxy (Edge) bundle.
 *
 * This module is server-only and nothing here ever reaches the browser, which
 * is why the values work without a NEXT_PUBLIC_ prefix. Do not add a helper
 * that hands them to a client component: a public page that carries the anon
 * key is a page anything can scrape it from.
 */

function pick(names: string[], values: (string | undefined)[]): string {
  const value = values.find((candidate) => candidate && candidate.trim());
  if (!value) {
    throw new Error(
      `ไม่พบค่า environment variable: ตั้งค่า ${names.join(' หรือ ')} ตามไฟล์ .env.example`,
    );
  }
  return value.trim();
}

export function supabaseUrl(): string {
  return pick(
    ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'],
    [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL],
  );
}

export function supabaseAnonKey(): string {
  return pick(
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'],
    [process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_ANON_KEY],
  );
}
