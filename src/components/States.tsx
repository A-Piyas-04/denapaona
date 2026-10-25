import type { ReactNode } from 'react';
import { Button, Skeleton } from './ui';
import { errorMessage } from '@/lib/errors';

export function EmptyState({ title, body, children }: { title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-semibold text-slate-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">{body}</p>}
      {children && <div className="mt-5 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-owe/30 bg-owe-soft p-4 text-sm text-owe" role="alert">
      <p>{errorMessage(error)}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
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
