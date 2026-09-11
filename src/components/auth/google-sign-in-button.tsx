'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-5">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.92v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.92a9 9 0 0 0 0 8.1l3.05-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .92 4.95L3.97 7.28C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const callback = new URL('/auth/callback', window.location.origin);
      if (next) callback.searchParams.set('next', next);

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callback.toString(),
          queryParams: { prompt: 'select_account' },
        },
      });
      if (signInError) throw signInError;
    } catch (caught) {
      setPending(false);
      setError(
        caught instanceof Error
          ? `เข้าสู่ระบบไม่สำเร็จ: ${caught.message}`
          : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      );
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-line-strong bg-surface px-4 text-base font-semibold text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:text-muted"
      >
        {pending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <GoogleMark />}
        เข้าสู่ระบบด้วย Google
      </button>
      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
