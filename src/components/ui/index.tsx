/**
 * shadcn/ui-style primitives, hand-rolled on Tailwind so the project builds
 * without the shadcn CLI.  Same conventions: variants via props, className
 * passthrough, accessible defaults.
 */
import {
  forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-teal-800 disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:text-slate-400',
  outline: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-owe text-white hover:bg-red-800 disabled:bg-slate-300',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-12 px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', block, busy, className, disabled, children, ...rest }, ref) => (
    <button
      ref={ref}
      // Disabled while busy: the double-tap guard from stories A-02#4 / B-01#8.
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed',
        VARIANTS[variant], SIZES[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900',
        'placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30',
        'scroll-mt-24',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[80px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px]',
        'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30',
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';

export function Field({ label, hint, error, children, htmlFor }: {
  label: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error ? <p className="text-sm text-owe" role="alert">{error}</p>
        : hint ? <p className="text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-slate-200 bg-white p-4', className)} {...rest}>{children}</div>;
}

export function Badge({ tone = 'slate', children, className }: {
  tone?: 'slate' | 'brand' | 'owe' | 'owed' | 'amber'; children: ReactNode; className?: string;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-soft text-teal-900',
    owe: 'bg-owe-soft text-owe',
    owed: 'bg-owed-soft text-owed',
    amber: 'bg-amber-100 text-amber-900',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

/** A loading placeholder.  Money screens show these, never a transient 0 (A-04#3). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200', className)} aria-hidden />;
}

export function Chip({ selected, onClick, children, className, disabled }: {
  selected?: boolean; onClick?: () => void; children: ReactNode; className?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
        selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        disabled && 'opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded-lg text-sm font-medium',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet modal — the mobile-first dialog. */
export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-labelledby={id}>
      <button className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-app overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        <h2 id={id} className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return url ? (
    <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer"
         className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-teal-900"
          style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials || '?'}
    </span>
  );
}
