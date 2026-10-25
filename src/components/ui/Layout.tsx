import { useCallback, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/format';

/** The figure a money screen is about: big, coloured, with one line of meaning. */
export function StatHero({ label, value, sub, action, tone = 'neutral', className, ...rest }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; action?: ReactNode;
  tone?: 'neutral' | 'owe' | 'owed'; className?: string; 'data-tour'?: string;
}) {
  return (
    <div className={cn('rounded-3xl border border-slate-200/80 bg-white px-5 py-5', className)} {...rest}>
      <p className={cn('text-[15px] font-medium', tone === 'owe' ? 'text-owe' : tone === 'owed' ? 'text-owed' : 'text-slate-500')}>{label}</p>
      <div className="mt-1 font-display text-[36px] font-semibold leading-tight tracking-tight text-slate-900 tnum">{value}</div>
      {(sub || action) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {sub && <div className="text-[14px] text-slate-500">{sub}</div>}
          {action}
        </div>
      )}
    </div>
  );
}

export interface ActionItem { icon: LucideIcon; label: string; to?: string; onClick?: () => void; 'data-tour'?: string }

/** A row of 2–4 shortcuts, each an icon with a short label. */
export function ActionBar({ items, className, ...rest }: { items: ActionItem[]; className?: string; 'data-tour'?: string }) {
  return (
    <div className={cn('grid gap-2', items.length === 4 ? 'grid-cols-4' : items.length === 3 ? 'grid-cols-3' : 'grid-cols-2', className)} {...rest}>
      {items.map(({ icon: Icon, label, to, onClick, ...r }) => {
        const inner = (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-brand transition-colors group-hover:border-brand/40">
              <Icon size={22} strokeWidth={1.9} aria-hidden />
            </span>
            <span className="text-[13px] font-medium text-slate-700">{label}</span>
          </>
        );
        const cls = 'group pressable flex flex-col items-center gap-1.5 rounded-2xl py-1';
        return to
          ? <Link key={label} to={to} className={cls} {...r}>{inner}</Link>
          : <button key={label} type="button" onClick={onClick} className={cls} {...r}>{inner}</button>;
      })}
    </div>
  );
}

/** Keeps the selected tab in the URL, so Back and refresh land on the same tab. */
export function useTabParam<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key) as T | null;
  const value = raw && allowed.includes(raw) ? raw : fallback;
  const set = useCallback((v: T) => {
    setParams((p) => { const n = new URLSearchParams(p); if (v === fallback) n.delete(key); else n.set(key, v); return n; }, { replace: true });
  }, [key, fallback, setParams]);
  return [value, set];
}

export function Tabs<T extends string>({ value, onChange, items, label, className }: {
  value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[]; label: string; className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 border-b border-slate-200', className)}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button key={it.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(it.id)}
                  className={cn('relative -mb-px inline-flex h-11 items-center gap-1.5 px-3 text-[15px] font-semibold transition-colors',
                    active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800')}>
            {it.label}
            {it.count !== undefined && it.count > 0 && (
              <span className={cn('min-w-[20px] rounded-full px-1.5 text-center text-[12px] leading-5',
                active ? 'bg-brand text-white' : 'bg-slate-200 text-slate-700')}>{it.count}</span>
            )}
            <span className={cn('absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand transition-transform duration-200 ease-out',
              active ? 'scale-x-100' : 'scale-x-0')} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** Floating primary action, sitting above the bottom nav. */
export function Fab({ to, label, icon: Icon, ...rest }: { to: string; label: string; icon: LucideIcon; 'data-tour'?: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-app justify-end px-4"
         style={{ bottom: 'calc(var(--nav-h, 0px) + env(safe-area-inset-bottom) + 16px)' }}>
      <Link to={to} {...rest}
            className="pressable pointer-events-auto inline-flex h-14 items-center gap-2 rounded-2xl bg-brand pl-4 pr-5 text-[16px] font-semibold text-white shadow-float hover:bg-brand-hover">
        <Icon size={22} strokeWidth={2.2} aria-hidden />
        {label}
      </Link>
    </div>
  );
}

/** One-line notice with an icon and an optional link. */
export function Banner({ icon: Icon, children, to, tone = 'neutral', action }: {
  icon?: LucideIcon; children: ReactNode; to?: string; tone?: 'neutral' | 'pending' | 'brand' | 'owe'; action?: ReactNode;
}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    pending: 'bg-pending-soft text-pending',
    brand: 'bg-brand-soft text-brand-ink',
    owe: 'bg-owe-soft text-owe',
  } as const;
  const inner = (
    <>
      {Icon && <Icon size={18} className="shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug">{children}</span>
      {action}
      {to && <ChevronRight size={18} className="shrink-0 opacity-60" aria-hidden />}
    </>
  );
  const cls = cn('flex min-h-[48px] items-center gap-2.5 rounded-2xl px-4 py-2.5', tones[tone], to && 'pressable');
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls} role="status">{inner}</div>;
}

/** The primary form action, kept in reach above the keyboard and the nav. */
export function StickyFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('sticky z-20 -mx-4 mt-auto bg-gradient-to-t from-canvas from-70% to-transparent px-4 pb-3 pt-6', className)}
         style={{ bottom: 'calc(var(--nav-h, 0px) + env(safe-area-inset-bottom))' }}>
      {children}
    </div>
  );
}
