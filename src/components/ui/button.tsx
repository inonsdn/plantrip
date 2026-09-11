import Link from 'next/link';
import type { ComponentProps } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-strong focus-visible:outline-brand-strong disabled:bg-brand/50',
  secondary:
    'border border-line-strong bg-surface text-ink hover:bg-canvas focus-visible:outline-brand disabled:text-muted',
  ghost: 'text-ink hover:bg-canvas focus-visible:outline-brand',
  danger:
    'border border-negative/30 bg-negative-soft text-negative hover:bg-negative hover:text-white focus-visible:outline-negative',
  accent: 'bg-accent text-white hover:brightness-95 focus-visible:outline-accent',
};

const SIZES: Record<Size, string> = {
  // 44px minimum touch target on every size except the deliberately compact one.
  sm: 'min-h-9 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'min-h-12 px-5 text-base gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed';

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
