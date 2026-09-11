'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, LayoutDashboard, Plus, ReceiptText, Users } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { ExpenseForm } from '@/components/expense/expense-form';
import { ShareLinkDialog } from './share-link';
import { TripHeader } from './trip-header';
import type { ExpenseView, TripContext } from '@/lib/types';

interface TripUiValue {
  context: TripContext;
  openExpense: (expense?: ExpenseView | null) => void;
  openShare: () => void;
}

const TripUiContext = createContext<TripUiValue | null>(null);

export function useTripUi(): TripUiValue {
  const value = useContext(TripUiContext);
  if (!value) throw new Error('useTripUi ต้องอยู่ภายใน TripShell');
  return value;
}

const TABS = [
  { key: 'overview', label: 'ภาพรวม', href: '', icon: LayoutDashboard },
  { key: 'expenses', label: 'ค่าใช้จ่าย', href: '/expenses', icon: ReceiptText },
  { key: 'settlement', label: 'ยอดโอน', href: '/settlement', icon: ArrowLeftRight },
  { key: 'members', label: 'สมาชิก', href: '/members', icon: Users },
] as const;

export function TripShell({
  context,
  inviteBaseUrl,
  children,
}: {
  context: TripContext;
  inviteBaseUrl: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = `/trips/${context.trip.id}`;

  const [expenseSheet, setExpenseSheet] = useState<{ open: boolean; expense: ExpenseView | null }>({
    open: false,
    expense: null,
  });
  // `?share=1` right after creating a trip: surface the invite link immediately.
  const [shareOpen, setShareOpen] = useState(() => searchParams.get('share') === '1');

  const openExpense = useCallback((expense?: ExpenseView | null) => {
    setExpenseSheet({ open: true, expense: expense ?? null });
  }, []);

  const openShare = useCallback(() => setShareOpen(true), []);

  const value = useMemo<TripUiValue>(
    () => ({ context, openExpense, openShare }),
    [context, openExpense, openShare],
  );

  const tabs = TABS.map((tab) => {
    const href = `${base}${tab.href}`;
    const active = tab.href === '' ? pathname === base : pathname.startsWith(href);
    return { ...tab, href, active };
  });

  return (
    <TripUiContext.Provider value={value}>
      <nav aria-label="เมนูทริป" className="hidden border-b border-line bg-surface sm:block">
        <div className="mx-auto flex w-full max-w-6xl gap-1 px-4 sm:px-6">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
                tab.active
                  ? 'border-brand text-brand-strong'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <tab.icon aria-hidden className="size-4" />
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pb-12 sm:pt-6">
        <TripHeader />
        {children}
      </main>

      {/* Floating add button: reachable with one thumb on mobile. */}
      <button
        type="button"
        onClick={() => openExpense(null)}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-brand px-5 text-base font-semibold text-white shadow-lg shadow-ink/20 transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong sm:bottom-6"
      >
        <Plus aria-hidden className="size-5" />
        เพิ่มค่าใช้จ่าย
      </button>

      <nav
        aria-label="เมนูหลัก"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur sm:hidden"
      >
        <ul className="grid grid-cols-4">
          {tabs.map((tab) => (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={tab.active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium ${
                  tab.active ? 'text-brand-strong' : 'text-muted'
                }`}
              >
                <tab.icon aria-hidden className="size-5" />
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Sheet
        open={expenseSheet.open}
        onClose={() => setExpenseSheet({ open: false, expense: null })}
        title={expenseSheet.expense ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย'}
        description={context.trip.name}
        size="lg"
      >
        {expenseSheet.open ? (
          <ExpenseForm
            key={expenseSheet.expense?.id ?? 'new'}
            context={context}
            expense={expenseSheet.expense}
            onDone={() => setExpenseSheet({ open: false, expense: null })}
          />
        ) : null}
      </Sheet>

      <ShareLinkDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        tripId={context.trip.id}
        inviteToken={context.trip.inviteToken}
        inviteBaseUrl={inviteBaseUrl}
        canRegenerate={context.isOwner}
      />
    </TripUiContext.Provider>
  );
}
