import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-sm shadow-ink/[0.03] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 text-brand">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink sm:text-base">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted sm:text-sm">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-4 py-4 sm:px-5 ${className}`}>{children}</div>;
}
