'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  durationMs?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, 'action'>> {
  id: number;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-positive/30 bg-positive-soft text-ink',
  error: 'border-negative/30 bg-negative-soft text-ink',
  info: 'border-line bg-surface text-ink',
};

const TONE_ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

const TONE_ICON_COLORS: Record<ToastTone, string> = {
  success: 'text-positive',
  error: 'text-negative',
  info: 'text-brand',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, tone = 'info', action, durationMs = action ? 7000 : 4000 }: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone, action, durationMs }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:pb-6"
      >
        {toasts.map((toast) => {
          const Icon = TONE_ICONS[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-ink/5 ${TONE_STYLES[toast.tone]}`}
            >
              <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${TONE_ICON_COLORS[toast.tone]}`} />
              <p className="flex-1 text-sm leading-6">{toast.message}</p>
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(toast.id);
                    void toast.action?.onClick();
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-brand-strong underline underline-offset-2 hover:bg-brand-soft"
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                aria-label="ปิดข้อความ"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-lg p-1 text-muted hover:bg-black/5"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast ต้องอยู่ภายใน ToastProvider');
  return context;
}
