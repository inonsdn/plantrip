import type { ReactNode } from 'react';
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="h-4 w-1/3 animate-pulse rounded bg-canvas" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <div key={index} className="h-3 w-full animate-pulse rounded bg-canvas" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      {icon ? <span className="text-brand">{icon}</span> : null}
      <div>
        <p className="text-base font-semibold text-ink">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  description,
  action,
  details,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  details?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-negative/30 bg-negative-soft px-5 py-6 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
      {details}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
