import { redirect } from 'next/navigation';
import { Plane } from 'lucide-react';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { startGoogleSignInAction } from '@/lib/actions/auth';
import { getCurrentUser } from '@/lib/auth';
import { APP_NAME } from '@/lib/branding';

export const metadata = { title: 'เข้าสู่ระบบ' };

function safeNext(value: string | undefined): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined;
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const target = safeNext(next);

  const user = await getCurrentUser();
  if (user) redirect(target ?? '/trips');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand text-white">
            <Plane aria-hidden className="size-5" />
          </span>
          <p className="text-lg font-bold text-ink">{APP_NAME}</p>
        </div>

        <h1 className="mt-5 text-xl font-semibold text-ink">เข้าสู่ระบบ</h1>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          บันทึกค่าใช้จ่ายระหว่างทริป หารกับเพื่อนอัตโนมัติ และรู้ว่าใครต้องโอนให้ใครเท่าไร
        </p>

        <form action={startGoogleSignInAction} className="mt-6 space-y-3">
          {target ? <input type="hidden" name="next" value={target} /> : null}
          <GoogleSignInButton />
          {error ? (
            <p role="alert" className="text-sm text-negative">
              เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
            </p>
          ) : null}
        </form>

        <p className="mt-5 text-xs leading-5 text-muted">
          เราใช้บัญชี Google เพื่อยืนยันตัวตนเท่านั้น และจะไม่แสดงอีเมลของคุณให้สมาชิกคนอื่นในทริปเห็น
        </p>
      </div>
    </main>
  );
}
