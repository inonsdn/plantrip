import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopBar } from '@/components/nav/top-bar';
import { CreateTripForm } from '@/components/trip/create-trip-form';
import { displayNameFromUser, requireUser } from '@/lib/auth';

export const metadata = { title: 'สร้างทริปใหม่' };

export default async function NewTripPage() {
  const user = await requireUser('/trips/new');

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />

      <main className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6 sm:py-8">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft aria-hidden className="size-4" />
          ทริปของฉัน
        </Link>

        <h1 className="mt-3 text-xl font-bold text-ink sm:text-2xl">สร้างทริปใหม่</h1>
        <p className="mt-0.5 text-sm text-muted">
          กรอกข้อมูลสั้น ๆ แล้วเริ่มบันทึกค่าใช้จ่ายได้ทันที แก้ไขภายหลังได้
        </p>

        <div className="mt-5 rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-6">
          <CreateTripForm defaultDisplayName={displayNameFromUser(user)} />
        </div>
      </main>
    </div>
  );
}
