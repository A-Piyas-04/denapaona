import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/format';

/** A titled block of a screen.  Titles are sentence case, never all caps. */
export function Section({ title, action, children, className }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-2.5 flex min-h-[28px] items-center justify-between gap-3 px-1">
          {title && <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** One white card holding rows separated by hairlines. */
export function ListGroup({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200/80 bg-white divide-y divide-slate-100', className)} {...rest}>
      {children}
    </div>
  );
}

type RowProps = {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
  tone?: 'default' | 'danger' | 'muted';
  /** Let the title run to two lines instead of truncating. */
  wrap?: boolean;
  'data-tour'?: string;
  'aria-label'?: string;
};

/** The workhorse row: leading avatar or icon, two lines of text, a value or chevron. */
export function ListRow({ leading, title, subtitle, trailing, to, onClick, chevron, className, tone = 'default', wrap, ...rest }: RowProps) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[16px] font-medium leading-snug', wrap ? 'line-clamp-2' : 'truncate',
          tone === 'danger' ? 'text-owe' : tone === 'muted' ? 'text-slate-400' : 'text-slate-900')}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] leading-snug text-slate-500">{subtitle}</span>}
      </span>
      {trailing !== undefined && <span className="shrink-0 text-right">{trailing}</span>}
      {(chevron ?? !!to) && <ChevronRight size={18} className="-mr-1 shrink-0 text-slate-300" aria-hidden />}
    </>
  );
  const cls = cn('flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left', (to || onClick) && 'transition-colors hover:bg-slate-50 active:bg-slate-100', className);
  if (to) return <Link to={to} className={cls} {...rest}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} {...rest}>{body}</button>;
  return <div className={cls} {...rest}>{body}</div>;
}

/** "See all" style link used in section headers. */
export function TextLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return <Link to={to} className={cn('text-sm font-semibold text-brand hover:underline', className)}>{children}</Link>;
}
