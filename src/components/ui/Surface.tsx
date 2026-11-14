import type { HTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/format';

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-paper-muted/50 bg-paper p-4 text-ink shadow-soft', className)} {...rest}>
      {children}
    </div>
  );
}

export type Tone = 'slate' | 'brand' | 'owe' | 'owed' | 'amber';

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const tones = {
    slate: 'bg-paper-muted text-ink-soft',
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

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg bg-gradient-to-r from-night-elev via-night-line/60 to-night-elev bg-[length:200%_100%] animate-shimmer',
        className,
      )}
      aria-hidden
    />
  );
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
        'pressable inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-[15px] font-medium',
        selected
          ? 'border-brand bg-brand-soft text-brand-ink'
          : 'border-night-line bg-night-elev text-cream hover:border-cream/30',
        disabled && 'opacity-40',
        className,
      )}
    >
      {selected && <Check size={15} strokeWidth={2.6} className="-ml-0.5 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-xl bg-night-elev p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'pressable h-10 rounded-lg text-[15px] font-medium transition-colors',
            value === o.value ? 'bg-brand text-brand-fg shadow-sm' : 'text-cream/55 hover:text-cream',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const AVATAR_TONES = [
  'bg-[#3A3018] text-[#F0B429]', 'bg-[#2A3348] text-[#A8B8E0]', 'bg-[#3A2818] text-[#E8A070]',
  'bg-[#2E2440] text-[#C4A8E8]', 'bg-[#1F3528] text-[#7BC49A]', 'bg-[#3A2028] text-[#E890A8]',
  'bg-[#1E3040] text-[#7EB8D8]', 'bg-[#353018] text-[#D4C070]',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, url, size = 36, seed, className, square }: {
  name: string; url?: string | null; size?: number; seed?: string; className?: string;
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

export function IconTile({ children, tone = 'slate', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  const tones = {
    slate: 'bg-paper-muted text-ink-soft',
    brand: 'bg-brand-soft text-brand-ink',
    owe: 'bg-owe-soft text-owe',
    owed: 'bg-owed-soft text-owed',
    amber: 'bg-pending-soft text-pending',
  } as const;
  return <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone], className)} aria-hidden>{children}</span>;
}
