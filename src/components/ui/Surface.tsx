import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/format';

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-slate-200/80 bg-white p-4', className)} {...rest}>{children}</div>;
}

export type Tone = 'slate' | 'brand' | 'owe' | 'owed' | 'amber';

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-soft text-brand-ink',
    owe: 'bg-owe-soft text-owe',
    owed: 'bg-owed-soft text-owed',
    amber: 'bg-pending-soft text-pending',
  } as const;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
}

/** A loading placeholder.  Money screens show these, never a transient 0 (A-04#3). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/80', className)} aria-hidden />;
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
        'pressable inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-[15px] font-medium transition-colors',
        selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        disabled && 'opacity-40',
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
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-xl bg-slate-200/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-10 rounded-lg text-[15px] font-medium transition-colors',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const AVATAR_TONES = [
  'bg-[#DCEFEA] text-[#0B5049]', 'bg-[#E3E8F8] text-[#2D3E8C]', 'bg-[#F6E6DA] text-[#8A3F12]',
  'bg-[#EDE3F4] text-[#5E2F82]', 'bg-[#E2F0DC] text-[#2F6420]', 'bg-[#F7E2E6] text-[#8C2440]',
  'bg-[#E0EEF6] text-[#1D5677]', 'bg-[#F3EDD5] text-[#6E5710]',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Initials on a colour derived from a stable seed, so people stay recognisable. */
export function Avatar({ name, url, size = 36, seed, className, square }: {
  name: string; url?: string | null; size?: number; seed?: string; className?: string;
  /** Rounded square — used for groups, so they don't read as people. */
  square?: boolean;
}) {
  const initials = name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const shape = square ? 'rounded-xl' : 'rounded-full';
  if (url) {
    return <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer"
                className={cn('shrink-0 object-cover', shape, className)} style={{ width: size, height: size }} />;
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center font-semibold', shape,
                        AVATAR_TONES[hash(seed ?? name) % AVATAR_TONES.length], className)}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {initials || '?'}
    </span>
  );
}

/** A rounded tile holding an icon — the leading element for non-person rows. */
export function IconTile({ children, tone = 'slate', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600', brand: 'bg-brand-soft text-brand', owe: 'bg-owe-soft text-owe',
    owed: 'bg-owed-soft text-owed', amber: 'bg-pending-soft text-pending',
  } as const;
  return <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone], className)} aria-hidden>{children}</span>;
}
