import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg shadow-gold hover:bg-brand-hover disabled:bg-night-elev disabled:text-ink-soft disabled:shadow-none',
  secondary: 'bg-night-elev text-ink hover:bg-night-line disabled:text-ink-soft',
  outline: 'border border-night-line bg-transparent text-ink hover:bg-night-elev disabled:text-ink-soft',
  ghost: 'text-ink hover:bg-night-elev disabled:text-ink-soft',
  danger: 'bg-owe text-white hover:bg-red-700 disabled:bg-night-elev disabled:text-ink-soft',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 min-h-[36px] px-3.5 text-sm',
  md: 'h-11 min-h-[44px] px-4 text-[15px]',
  lg: 'h-12 min-h-[48px] px-5 text-base',
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
        'pressable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
        tone === 'brand'
          ? 'bg-brand text-brand-fg shadow-gold hover:bg-brand-hover'
          : 'text-ink-soft hover:bg-night-elev hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
