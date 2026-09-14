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
  // The attempt this ref remembers, not merely "have we started".
  const attempted = useRef<number | null>(null);

  useEffect(() => {
    // Exactly one attempt per retryKey, and the only way to get a new retryKey
    // is the button below.
    //
    // This used to clear a boolean on failure so that a later run of the
    // effect would try again. Nothing paced those retries, so any change that
    // made the effect re-run would have hammered join_trip_by_token — which
    // raises on a bad token, leaving an aborted transaction behind each time.
    // It never actually fired twice in testing; it was a trap waiting for a
    // dependency of this effect to become unstable.
    if (attempted.current === retryKey) return;
    attempted.current = retryKey;

    void (async () => {
      // The action can reject outright — the network drops, the deployment is
      // mid-rollout — and an unhandled rejection here left the page spinning
      // forever with no message and no way to retry.
      let result;
      try {
        result = await joinTripAction(inviteToken);
      } catch {
        setError('เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง');
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(`/trips/${result.data.tripId}`);
    })();

    // No cancellation flag: the guard above means there is only ever one
    // attempt in flight, and discarding its result on an effect re-run (React
    // double-invokes them in development) left the page spinning with the
    // answer thrown away.
  }, [inviteToken, router, retryKey]);

  if (error) {
    return (
      <ErrorState
        title="เข้าร่วมทริปไม่สำเร็จ"
        description={error}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              onClick={() => {
                setError(null);
                setRetryKey((key) => key + 1);
              }}
            >
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
