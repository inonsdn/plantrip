import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { supabaseAnonKey, supabaseUrl } from './env';

/**
 * Server client bound to the request cookies. Row level security still applies:
 * this is the user's own session, not an elevated one.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: the middleware refreshes the
          // session cookie instead, so this is safe to ignore.
        }
      },
    },
  });
}
