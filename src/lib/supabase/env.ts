import 'server-only';

/**
 * Supabase configuration.
 *
 * Both naming conventions are accepted, `NEXT_PUBLIC_*` first:
 *   NEXT_PUBLIC_SUPABASE_URL      | SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY | SUPABASE_ANON_KEY
 *   NEXT_PUBLIC_SITE_URL          | SITE_URL
 *
 * Every lookup below references `process.env.X` literally. Next.js only inlines
 * statically written references, so a dynamic `process.env[name]` would read as
 * undefined inside the proxy (Edge) bundle.
 *
 * This module is server-only. The browser never reads these: the sign-in page
 * passes the URL and anon key to the client component that needs them, which is
 * why the values work without a NEXT_PUBLIC_ prefix.
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

/** Config handed to the browser client. The anon key is public by design. */
export function publicSupabaseConfig(): { url: string; anonKey: string } {
  return { url: supabaseUrl(), anonKey: supabaseAnonKey() };
}

/** Absolute origin of this deployment, used to render invitation links. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
