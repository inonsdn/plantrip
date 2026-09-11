'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { ErrorDetails } from '@/components/ui/error-details';

export default function TripError({
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
    <ErrorState
      title="โหลดข้อมูลทริปไม่สำเร็จ"
      description="อาจเป็นปัญหาการเชื่อมต่อชั่วคราว กรุณาลองใหม่อีกครั้ง"
      details={<ErrorDetails error={error} />}
      action={
        <Button type="button" onClick={reset}>
          ลองอีกครั้ง
        </Button>
      }
    />
  );
}
