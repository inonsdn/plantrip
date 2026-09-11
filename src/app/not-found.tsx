import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { Compass } from 'lucide-react';

export const metadata = { title: 'ไม่พบหน้านี้' };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <EmptyState
        icon={<Compass aria-hidden className="size-8" />}
        title="ไม่พบหน้าที่คุณกำลังมองหา"
        description="ลิงก์อาจถูกเปลี่ยน หรือคุณไม่มีสิทธิ์เข้าถึงหน้านี้"
        action={<LinkButton href="/trips">กลับไปหน้าทริปของฉัน</LinkButton>}
      />
    </main>
  );
}
