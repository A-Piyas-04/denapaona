import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/format';

const FIELD = cn(
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[16px] text-slate-900',
  'placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150',
  'focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15',
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
  /** Keep the label for screen readers and tests but don't show it. */
  srLabel?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className={srLabel ? 'sr-only' : 'block text-sm font-medium text-slate-700'}>{label}</label>
      {children}
      {error ? <p className="text-[13px] text-owe" role="alert">{error}</p>
        : hint ? <p className="text-[13px] text-slate-500">{hint}</p> : null}
    </div>
  );
}
