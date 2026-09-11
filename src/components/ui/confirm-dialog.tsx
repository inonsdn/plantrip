'use client';

import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { Sheet } from './sheet';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  tone = 'danger',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {description ? <div className="text-sm leading-6 text-ink-soft">{description}</div> : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={handleConfirm}
          disabled={pending}
          data-autofocus
        >
          {pending ? 'กำลังดำเนินการ…' : confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
