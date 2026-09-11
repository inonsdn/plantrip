import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { avatarFromUser, displayNameFromUser } from '@/lib/auth';

function safeNext(value: string | null): string {
  // Only allow same-origin paths so the callback cannot be used as an open redirect.
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/trips';
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocal = process.env.NODE_ENV === 'development';
  const baseUrl = !isLocal && forwardedHost ? `https://${forwardedHost}` : origin;

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/auth/auth-code-error`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${baseUrl}/auth/auth-code-error`);
  }

  // Keep the profile row fresh (the database trigger creates it; this keeps the
  // avatar and name in sync on later sign-ins).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          display_name: displayNameFromUser(user),
          avatar_url: avatarFromUser(user),
        },
        { onConflict: 'id' },
      );
  }

  return NextResponse.redirect(`${baseUrl}${next}`);
}
