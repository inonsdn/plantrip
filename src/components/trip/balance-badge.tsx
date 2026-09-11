import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { formatMoney } from '@/lib/money';

/**
 * Net balance shown with an icon and a word, never colour alone.
 */
export function BalanceBadge({
  netMinor,
  currency,
  size = 'md',
}: {
  netMinor: number;
  currency: string;
  size?: 'sm' | 'md';
}) {
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  if (netMinor === 0) {
    return (
      <span className={`inline-flex min-w-0 flex-wrap items-center justify-end gap-x-1 font-medium text-muted ${textSize}`}>
        <CheckCircle2 aria-hidden className="size-4" />
        เคลียร์แล้ว
      </span>
    );
  }

  const receiving = netMinor > 0;
  return (
    <span
      // Wraps instead of overflowing at 200% zoom / very narrow viewports.
      className={`tabular inline-flex min-w-0 flex-wrap items-center justify-end gap-x-1 font-semibold ${textSize} ${
        receiving ? 'text-positive' : 'text-negative'
      }`}
    >
      {receiving ? (
        <ArrowDownLeft aria-hidden className="size-4" />
      ) : (
        <ArrowUpRight aria-hidden className="size-4" />
      )}
      <span className="font-medium">{receiving ? 'ต้องรับ' : 'ต้องจ่าย'}</span>
      {formatMoney(Math.abs(netMinor), currency)}
    </span>
  );
}
