'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../supabase/server';
import { requestOrigin } from '../request-origin';

/** Only same-origin paths, so the callback cannot become an open redirect. */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/**
 * Starts the Google sign-in from the server.
 *
 * The authorize URL and the PKCE verifier are both produced here, so the anon
 * key never reaches the browser. It used to be handed to a client component as
 * a prop, which put it in the HTML of a public page — where anything that can
 * fetch that page can read it and call the REST API with it. Row level security
 * meant no data was ever at risk, but the requests still cost CPU.
 *
 * The verifier is written to a cookie by the server client's cookie adapter and
 * read back by /auth/callback, which is the flow @supabase/ssr is built for.
 */
export async function startGoogleSignInAction(formData: FormData): Promise<void> {
  const next = safeNext(formData.get('next')?.toString() ?? null);

  const callback = new URL('/auth/callback', await requestOrigin());
  if (next) callback.searchParams.set('next', next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callback.toString(),
      queryParams: { prompt: 'select_account' },
      // There is no window here; we want the URL, not a redirect.
      skipBrowserRedirect: true,
    },
  });

  // redirect() throws to unwind, so it has to sit outside any try/catch.
  redirect(error || !data?.url ? '/login?error=auth' : data.url);
}
