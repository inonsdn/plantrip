'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { regenerateInviteTokenAction } from '@/lib/actions/trips';

export function ShareLinkDialog({
  open,
  onClose,
  tripId,
  inviteToken,
  inviteBaseUrl,
  canRegenerate,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  inviteToken: string;
  /** Absolute site URL, provided by the server so SSR and client agree. */
  inviteBaseUrl: string;
  canRegenerate: boolean;
}) {
  const { showToast } = useToast();
  // Holds a token minted in this session until the server data catches up.
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const token = freshToken ?? inviteToken;
  const url = `${inviteBaseUrl}/join/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      showToast({ message: 'คัดลอกลิงก์เชิญแล้ว', tone: 'success' });
    } catch {
      showToast({ message: 'คัดลอกไม่สำเร็จ กรุณาคัดลอกลิงก์ด้วยตัวเอง', tone: 'error' });
    }
  }

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateInviteTokenAction(tripId);
      setConfirmOpen(false);
      if (!result.ok) {
        showToast({ message: result.error, tone: 'error' });
        return;
      }
      setFreshToken(result.data.inviteToken);
      showToast({ message: 'สร้างลิงก์ใหม่แล้ว ลิงก์เดิมใช้ไม่ได้อีกต่อไป', tone: 'success' });
    });
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="ชวนเพื่อนเข้าทริป"
        description="ใครก็ตามที่เปิดลิงก์นี้และเข้าสู่ระบบด้วย Google จะเข้าร่วมทริปได้ทันที"
      >
        <div className="space-y-4">
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={url}
              aria-label="ลิงก์เชิญ"
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-11 w-full rounded-lg border border-line-strong bg-canvas px-3 text-sm text-ink-soft"
            />
            <Button type="button" onClick={copy} className="shrink-0">
              {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              <span className="sr-only sm:not-sr-only">คัดลอก</span>
            </Button>
          </div>

          <p className="text-xs leading-5 text-muted">
            ลิงก์นี้เดาไม่ได้ แต่ใครที่ได้รับลิงก์ก็เข้าร่วมได้ ถ้าลิงก์หลุดไปถึงคนที่ไม่เกี่ยวข้อง
            ให้สร้างลิงก์ใหม่ สมาชิกเดิมจะยังอยู่ในทริปตามปกติ
          </p>

          {canRegenerate ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmOpen(true)}
              disabled={pending}
            >
              <RefreshCw aria-hidden className="size-4" />
              สร้างลิงก์ใหม่
            </Button>
          ) : null}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        title="สร้างลิงก์เชิญใหม่?"
        description="ลิงก์เดิมจะใช้ไม่ได้ทันที สมาชิกที่เข้าร่วมแล้วยังอยู่ในทริปเหมือนเดิม"
        confirmLabel="สร้างลิงก์ใหม่"
        tone="primary"
        onConfirm={regenerate}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

export function ShareLinkButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <Button type="button" variant="secondary" size={compact ? 'sm' : 'md'} onClick={onClick}>
      <Link2 aria-hidden className="size-4" />
      แชร์ลิงก์
    </Button>
  );
}
