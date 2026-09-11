import Link from 'next/link';
import { LogOut, Plane } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { MemberAvatar } from '@/components/ui/avatar';
import { APP_NAME } from '@/lib/branding';
import { avatarFromUser, displayNameFromUser } from '@/lib/auth';

export function TopBar({ user, children }: { user: User; children?: React.ReactNode }) {
  const name = displayNameFromUser(user);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href="/trips"
          className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-2 font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-brand text-white">
            <Plane aria-hidden className="size-4.5" />
          </span>
          <span className="hidden sm:inline">{APP_NAME}</span>
        </Link>

        <div className="min-w-0 flex-1">{children}</div>

        <div className="flex shrink-0 items-center gap-2">
          <MemberAvatar name={name} avatarUrl={avatarFromUser(user)} size="sm" />
          <span className="hidden max-w-32 truncate text-sm text-ink-soft md:inline">{name}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="ออกจากระบบ"
              className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <LogOut aria-hidden className="size-4.5" />
              <span className="sr-only">ออกจากระบบ</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
