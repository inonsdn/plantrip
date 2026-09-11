import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from './supabase/server';

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/**
 * Server-side guard. `nextPath` is where the user is sent back to once they
 * have finished signing in with Google.
 */
export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login';
    redirect(target);
  }
  return user;
}

export function displayNameFromUser(user: User): string {
  const metadata = user.user_metadata ?? {};
  const candidates = [metadata.full_name, metadata.name, user.email?.split('@')[0]];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return 'ฉัน';
}

export function avatarFromUser(user: User): string | null {
  const metadata = user.user_metadata ?? {};
  const url = metadata.avatar_url ?? metadata.picture;
  return typeof url === 'string' && url ? url : null;
}
