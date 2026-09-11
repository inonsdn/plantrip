import { redirect } from 'next/navigation';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { TopBar } from '@/components/nav/top-bar';
import { JoinTrip } from '@/components/trip/join-trip';
import { requireUser } from '@/lib/auth';
import { getTripPreview } from '@/lib/queries/trips';
import { formatDateRange } from '@/lib/format';

export const metadata = { title: 'เข้าร่วมทริป' };

export default async function JoinPage({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  // Not signed in? Come back here straight after Google sign-in.
  const user = await requireUser(`/join/${inviteToken}`);

  const preview = await getTripPreview(inviteToken);

  if (preview?.already_member) {
    redirect(`/trips/${preview.trip_id}`);
  }

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />

      <main className="mx-auto w-full max-w-md px-4 py-8 sm:px-6">
        {!preview ? (
          <ErrorState
            title="ลิงก์เชิญนี้ใช้ไม่ได้แล้ว"
            description="ลิงก์อาจถูกยกเลิกหรือสร้างใหม่ กรุณาขอลิงก์ล่าสุดจากเจ้าของทริป"
            action={<LinkButton href="/trips">ไปที่ทริปของฉัน</LinkButton>}
          />
        ) : (
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-sm text-muted">คุณได้รับเชิญให้เข้าร่วมทริป</p>
            <h1 className="mt-1 text-xl font-bold text-ink">{preview.name}</h1>

            <dl className="mt-3 space-y-1.5 text-sm text-ink-soft">
              {preview.destination ? (
                <div className="flex items-center gap-2">
                  <dt className="sr-only">จุดหมาย</dt>
                  <MapPin aria-hidden className="size-4 text-muted" />
                  <dd>{preview.destination}</dd>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <dt className="sr-only">ช่วงวันเดินทาง</dt>
                <CalendarDays aria-hidden className="size-4 text-muted" />
                <dd>{formatDateRange(preview.start_date, preview.end_date)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="sr-only">สมาชิก</dt>
                <Users aria-hidden className="size-4 text-muted" />
                <dd>
                  {preview.member_count} คน
                  {preview.owner_display_name ? ` · จัดโดย ${preview.owner_display_name}` : ''}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-line pt-3">
              <JoinTrip inviteToken={inviteToken} tripName={preview.name} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
