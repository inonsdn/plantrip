'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * A bottom sheet on phones, a centred dialog from `sm` up.
 * Keeps the page behind it from scrolling and restores focus on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
      );
    focusTarget?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="ปิด"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`animate-sheet-in relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl shadow-ink/20 sm:max-h-[86dvh] sm:rounded-2xl ${
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="-mr-1 rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>
      </div>
    </div>
  );
}
