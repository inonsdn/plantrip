import type { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'brand';
  icon?: ReactNode;
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : tone === 'brand'
          ? 'text-brand-strong'
          : 'text-ink';

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm shadow-ink/[0.03]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`tabular mt-1.5 text-xl font-bold sm:text-2xl ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}
