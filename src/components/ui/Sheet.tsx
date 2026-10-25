import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronRight, Info, MoreHorizontal, X, type LucideIcon } from 'lucide-react';
import { Button, IconButton } from './Button';
import { cn } from '@/lib/format';

/** Bottom sheet modal — the mobile-first dialog.  Centred card on wide screens. */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  /** Actions pinned to the bottom of the sheet. */
  footer?: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
      prevFocus?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal aria-labelledby={id}>
      <button className="absolute inset-0 animate-fade-in bg-slate-950/45" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={panel} tabIndex={-1}
           className="relative flex max-h-[88vh] w-full max-w-app animate-sheet-in flex-col rounded-t-3xl bg-white outline-none sm:rounded-3xl">
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-3 sm:pt-5">
          <h2 id={id} className="min-w-0 flex-1 text-lg font-semibold text-slate-900">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2 h-9 w-9 text-slate-500"><X size={20} /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** A small "i" that opens a longer explanation, so main screens stay short. */
export function InfoSheet({ title, children, label = 'More about this', className }: {
  title: string; children: ReactNode; label?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label={label} onClick={() => setOpen(true)} className={cn('h-8 w-8 text-slate-400 hover:text-slate-700', className)}>
        <Info size={18} />
      </IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}
             footer={<Button block variant="secondary" onClick={() => setOpen(false)}>Got it</Button>}>
        <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
      </Sheet>
    </>
  );
}

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  to?: string;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  hidden?: boolean;
  hint?: string;
}

/** The three-dot menu: secondary actions live here instead of crowding the screen. */
export function MoreMenu({ items, title = 'Options', label = 'More options', 'data-tour': tour }: {
  items: MenuItem[]; title?: string; label?: string; 'data-tour'?: string;
}) {
  const [open, setOpen] = useState(false);
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;
  return (
    <>
      <IconButton label={label} onClick={() => setOpen(true)} data-tour={tour}><MoreHorizontal size={22} /></IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <ul className="-mx-2">
          {visible.map((item) => {
            const Icon = item.icon;
            const inner = (
              <>
                {Icon && <Icon size={20} className={item.tone === 'danger' ? 'text-owe' : 'text-slate-500'} aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[16px] font-medium', item.tone === 'danger' ? 'text-owe' : 'text-slate-900')}>{item.label}</span>
                  {item.hint && <span className="block text-[13px] text-slate-500">{item.hint}</span>}
                </span>
                {item.to && <ChevronRight size={18} className="text-slate-300" aria-hidden />}
              </>
            );
            const cls = 'flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50';
            return (
              <li key={item.label}>
                {item.to
                  ? <Link to={item.to} className={cls} onClick={() => setOpen(false)}>{inner}</Link>
                  : <button type="button" className={cls} onClick={() => { setOpen(false); item.onClick?.(); }}>{inner}</button>}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
