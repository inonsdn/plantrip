'use client';

import type { ComponentProps, ReactNode } from 'react';
import { useId } from 'react';

const CONTROL =
  'w-full min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-muted/70 focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand disabled:bg-canvas disabled:text-muted';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-1 text-negative">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-negative">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-5 text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function TextArea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea className={`${CONTROL} py-2 ${className}`} rows={3} {...props} />;
}

export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select className={`${CONTROL} pr-8 ${className}`} {...props} />;
}

export function Checkbox({
  label,
  hint,
  className = '',
  ...props
}: ComponentProps<'input'> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  const inputId = props.id ?? id;
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <input
        type="checkbox"
        id={inputId}
        className="mt-0.5 size-5 shrink-0 accent-brand focus:outline-2 focus:outline-offset-2 focus:outline-brand"
        {...props}
      />
      <label htmlFor={inputId} className="min-w-0 text-sm leading-6 text-ink">
        <span className="font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-5 text-muted">{hint}</span> : null}
      </label>
    </div>
  );
}
