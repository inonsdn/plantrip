'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <ErrorState
        title="เกิดข้อผิดพลาด"
        description="ระบบไม่สามารถแสดงหน้านี้ได้ กรุณาลองใหม่อีกครั้ง"
        action={
          <Button type="button" onClick={reset}>
            ลองอีกครั้ง
          </Button>
        }
      />
    </main>
  );
}
