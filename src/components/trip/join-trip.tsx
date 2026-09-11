'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { joinTripAction } from '@/lib/actions/trips';

/**
 * Joining needs no approval: the invitation token is the authorization, so the
 * membership is created as soon as the signed-in visitor lands here.
 */
export function JoinTrip({ inviteToken, tripName }: { inviteToken: string; tripName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    void (async () => {
      const result = await joinTripAction(inviteToken);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        started.current = false;
        return;
      }
      router.replace(`/trips/${result.data.tripId}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteToken, router, retryKey]);

  if (error) {
    return (
      <ErrorState
        title="เข้าร่วมทริปไม่สำเร็จ"
        description={error}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => setRetryKey((key) => key + 1)}>
              ลองอีกครั้ง
            </Button>
            <LinkButton href="/trips" variant="secondary">
              ไปที่ทริปของฉัน
            </LinkButton>
          </div>
        }
      />
    );
  }

  return (
    <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      กำลังเพิ่มคุณเข้าทริป “{tripName}” …
    </div>
  );
}
