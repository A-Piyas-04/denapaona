import type { ReactNode } from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { Button, Skeleton } from './ui';
import { errorMessage } from '@/lib/errors';

/** An empty screen is an invitation to act: an icon, one line, one action. */
export function EmptyState({ title, body, children, icon: Icon }: {
  title: string; body?: ReactNode; children?: ReactNode; icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-slate-200/80 bg-white px-6 py-10 text-center">
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand" aria-hidden>
          <Icon size={26} strokeWidth={1.8} />
        </span>
      )}
      <p className="font-display text-[17px] font-semibold text-slate-900">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-[17rem] text-[15px] leading-relaxed text-slate-500">{body}</p>}
      {children && <div className="mt-6 flex w-full max-w-[16rem] flex-col gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-owe-soft p-4 text-owe" role="alert">
      <AlertCircle size={20} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{errorMessage(error)}</p>
        {onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white px-5 py-5" aria-busy>
      <Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-44" /><Skeleton className="h-4 w-32" />
    </div>
  );
}

/** Wrap a query: skeleton while loading, error with retry, content otherwise. */
export function Loadable<T>({ query, children, skeleton }: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
}) {
  if (query.isLoading) return <>{skeleton ?? <ListSkeleton />}</>;
  if (query.error && query.data === undefined) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}
