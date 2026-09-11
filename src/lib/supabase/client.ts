'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export interface SupabaseBrowserConfig {
  url: string;
  anonKey: string;
}

/**
 * Browser client. The config is passed in from a server component rather than
 * read from `process.env`, so the environment variables do not need a
 * NEXT_PUBLIC_ prefix. Only the anon key ever reaches the browser — the
 * service-role key is not used anywhere in this app.
 */
export function createClient({ url, anonKey }: SupabaseBrowserConfig) {
  return createBrowserClient<Database>(url, anonKey);
}
