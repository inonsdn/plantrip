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
    // Wraps the action below the title when there is not room for both, rather
    // than squeezing the heading into a narrow column.
    <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-48 flex-1 items-start gap-2.5">
        {icon ? <span className="mt-0.5 text-brand">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink sm:text-base">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted sm:text-sm">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
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
