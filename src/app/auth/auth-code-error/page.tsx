import { LinkButton } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

export const metadata = { title: 'เข้าสู่ระบบไม่สำเร็จ' };

export default function AuthCodeErrorPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <ErrorState
        title="เข้าสู่ระบบไม่สำเร็จ"
        description="ลิงก์ยืนยันอาจหมดอายุหรือถูกใช้ไปแล้ว กรุณาลองเข้าสู่ระบบอีกครั้ง"
        action={<LinkButton href="/login">กลับไปหน้าเข้าสู่ระบบ</LinkButton>}
      />
    </main>
  );
}
