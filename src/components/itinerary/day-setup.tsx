'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ensureItineraryDaysAction } from '@/lib/actions/itinerary';

/**
 * Days are created explicitly rather than on every page view, so visiting the
 * itinerary never writes to the trip on its own.
 */
export function ItineraryDaySetup({
  tripId,
  missingDates,
  hasDates,
  hasDays,
}: {
  tripId: string;
  missingDates: string[];
  hasDates: boolean;
  hasDays: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  if (!hasDates && !hasDays) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-6 text-ink-soft">
        ทริปนี้ยังไม่ได้ระบุวันเริ่มต้น กำหนดช่วงวันที่ของทริปก่อน
        แล้วจึงสร้างวันในแผนการเดินทางได้
      </p>
    );
  }

  if (missingDates.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3">
      <p className="text-sm text-ink">
        ยังไม่ได้สร้าง {missingDates.length} วันตามช่วงวันที่ของทริป
      </p>
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await ensureItineraryDaysAction({ tripId, dates: missingDates });
            if (!result.ok) {
              showToast({ message: result.error, tone: 'error' });
              return;
            }
            showToast({ message: 'สร้างวันในแผนแล้ว', tone: 'success' });
            router.refresh();
          })
        }
      >
        <CalendarPlus aria-hidden className="size-4" />
        สร้างวันในแผน
      </Button>
    </div>
  );
}
