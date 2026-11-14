import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/format';

const FIELD = cn(
  'w-full rounded-xl border border-paper-muted bg-paper px-3.5 text-[16px] text-ink',
  'placeholder:text-ink-soft/50 transition-[border-color,box-shadow] duration-150',
  'focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/25',
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, autoComplete = 'off', ...rest }, ref) => (
    <input ref={ref} autoComplete={autoComplete} className={cn(FIELD, 'h-12 scroll-mt-24', className)} {...rest} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => <textarea ref={ref} className={cn(FIELD, 'min-h-[88px] py-2.5', className)} {...rest} />,
);
Textarea.displayName = 'Textarea';

export function Field({ label, hint, error, children, htmlFor, srLabel }: {
  label: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string;
  srLabel?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className={srLabel ? 'sr-only' : 'block text-sm font-medium text-cream/75'}>{label}</label>
      {children}
      {error ? <p className="text-[13px] text-[#FF8A75]" role="alert">{error}</p>
        : hint ? <p className="text-[13px] text-cream/45">{hint}</p> : null}
    </div>
  );
}
