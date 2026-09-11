import Link from 'next/link';
import { CalendarDays, MapPin, Plus, Users, Luggage } from 'lucide-react';
import { TopBar } from '@/components/nav/top-bar';
import { LinkButton } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { requireUser } from '@/lib/auth';
import { listTripSummaries } from '@/lib/queries/trips';
import { formatDateRange } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { TripSummaryView } from '@/lib/types';

export const metadata = { title: 'ทริปของฉัน' };

function TripCard({ trip }: { trip: TripSummaryView }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block rounded-xl border border-line bg-surface p-4 shadow-sm shadow-ink/[0.03] transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold text-ink">{trip.name}</h2>
        {trip.role === 'owner' ? (
          <span className="shrink-0 rounded-md border border-brand/30 bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand-strong">
            เจ้าของทริป
          </span>
        ) : null}
      </div>

      <dl className="mt-3 space-y-1.5 text-sm text-ink-soft">
        {trip.destination ? (
          <div className="flex items-center gap-2">
            <dt className="sr-only">จุดหมาย</dt>
            <MapPin aria-hidden className="size-4 shrink-0 text-muted" />
            <dd className="truncate">{trip.destination}</dd>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <dt className="sr-only">ช่วงวันเดินทาง</dt>
          <CalendarDays aria-hidden className="size-4 shrink-0 text-muted" />
          <dd>{formatDateRange(trip.startDate, trip.endDate)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">จำนวนสมาชิก</dt>
          <Users aria-hidden className="size-4 shrink-0 text-muted" />
          <dd>{trip.memberCount} คน</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-xs text-muted">ค่าใช้จ่ายรวม</span>
        <span className="tabular text-lg font-semibold text-ink">
          {formatMoney(trip.totalMinor, trip.baseCurrency)}
        </span>
      </div>
    </Link>
  );
}

export default async function TripsPage() {
  const user = await requireUser('/trips');

  let trips: TripSummaryView[] = [];
  let loadError: string | null = null;
  try {
    trips = await listTripSummaries();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ';
  }

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />

      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink sm:text-2xl">ทริปของฉัน</h1>
            <p className="mt-0.5 text-sm text-muted">ทริปที่คุณสร้างเอง และทริปที่ถูกเชิญเข้าร่วม</p>
          </div>
          <LinkButton href="/trips/new">
            <Plus aria-hidden className="size-4.5" />
            สร้างทริปใหม่
          </LinkButton>
        </div>

        <div className="mt-5">
          {loadError ? (
            <ErrorState
              description={`โหลดรายการทริปไม่สำเร็จ (${loadError})`}
              action={<LinkButton href="/trips">ลองอีกครั้ง</LinkButton>}
            />
          ) : trips.length === 0 ? (
            <EmptyState
              icon={<Luggage aria-hidden className="size-8" />}
              title="ยังไม่มีทริป"
              description="สร้างทริปแรกของคุณ แล้วส่งลิงก์ชวนเพื่อนเข้ามาช่วยกันบันทึกค่าใช้จ่าย"
              action={
                <LinkButton href="/trips/new">
                  <Plus aria-hidden className="size-4.5" />
                  สร้างทริปใหม่
                </LinkButton>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <TripCard trip={trip} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
