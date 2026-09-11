'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { supabaseAnonKey, supabaseUrl } from './env';

/**
 * Browser client. Uses the anon key only — the service role key must never
 * reach the browser.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
