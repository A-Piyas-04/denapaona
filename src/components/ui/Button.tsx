import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover disabled:bg-slate-200 disabled:text-slate-500',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:text-slate-400',
  outline: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-owe text-white hover:bg-red-800 disabled:bg-slate-200 disabled:text-slate-500',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-12 px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  busy?: boolean;
}

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', block?: boolean, className?: string) => cn(
  'pressable inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold',
  'disabled:cursor-not-allowed',
  VARIANTS[variant], SIZES[size], block && 'w-full', className,
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', block, busy, className, disabled, children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      // Disabled while busy: the double-tap guard from stories A-02#4 / B-01#8.
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, size, block, className)}
      {...rest}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/** A link styled as a button — for navigation, so it stays a real link. */
export function ButtonLink({ to, variant, size, block, className, children, ...rest }: {
  to: string; variant?: Variant; size?: Size; block?: boolean; className?: string; children: ReactNode;
} & Record<`data-${string}`, string>) {
  return <Link to={to} className={buttonClass(variant, size, block, className)} {...rest}>{children}</Link>;
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'brand' }>(
  ({ label, tone = 'default', className, children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'pressable inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        tone === 'brand' ? 'bg-brand text-white hover:bg-brand-hover' : 'text-slate-700 hover:bg-slate-200/70',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
