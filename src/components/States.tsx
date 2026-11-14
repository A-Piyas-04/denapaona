import type { ReactNode } from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { BrandLockup } from './Brand';
import { Button, Skeleton } from './ui';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/format';

export function AuthSplash({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="app-frame safe-top safe-bottom items-center justify-center px-8" role="status" aria-live="polite" aria-busy>
      <BrandLockup size="lg" stacked showRoman className="animate-fade-in" />
      <div className="mt-10 h-1 w-28 overflow-hidden rounded-full bg-brand-muted">
        <div className="h-full w-1/2 animate-indeterminate rounded-full bg-brand" />
      </div>
      <p className="mt-4 text-[14px] font-medium text-cream/50">{message}</p>
    </div>
  );
}

export function ScreenSkeleton({ variant = 'list' }: { variant?: 'list' | 'dashboard' | 'form' | 'detail' }) {
  if (variant === 'dashboard') {
    return (
      <div className="space-y-5 animate-fade-in" aria-busy>
        <HeroSkeleton />
        <Skeleton className="h-11 w-full rounded-none bg-night-elev" />
        <ListSkeleton rows={3} />
      </div>
    );
  }
  if (variant === 'form') {
    return (
      <div className="space-y-5 animate-fade-in" aria-busy>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }
  if (variant === 'detail') {
    return (
      <div className="space-y-4 animate-fade-in" aria-busy>
        <HeroSkeleton />
        <ListSkeleton rows={4} />
      </div>
    );
  }
  return (
    <div className="space-y-4 animate-fade-in" aria-busy>
      <Skeleton className="h-24 w-full rounded-3xl" />
      <ListSkeleton rows={4} />
    </div>
  );
}

export function EmptyState({ title, body, children, icon: Icon }: {
  title: string; body?: ReactNode; children?: ReactNode; icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-night-line bg-night px-6 py-12 text-center shadow-soft">
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-muted text-brand" aria-hidden>
          <Icon size={26} strokeWidth={1.8} />
        </span>
      )}
      <p className="font-display text-[17px] font-semibold text-paper">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-[17rem] text-[15px] leading-relaxed text-cream/55">{body}</p>}
      {children && <div className="mt-6 flex w-full max-w-[16rem] flex-col gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-owe-soft p-4 text-owe animate-fade-in" role="alert">
      <AlertCircle size={20} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{errorMessage(error)}</p>
        {onRetry && <Button variant="outline" size="sm" className="mt-3 border-owe/30 text-owe" onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-paper-muted/30 bg-paper" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-paper-muted/70 px-4 py-3.5 last:border-0">
          <Skeleton className="h-10 w-10 rounded-xl !from-paper-muted !via-paper !to-paper-muted" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3 !from-paper-muted !via-paper !to-paper-muted" />
            <Skeleton className="h-3 w-1/3 !from-paper-muted !via-paper !to-paper-muted" />
          </div>
          <Skeleton className="h-4 w-16 !from-paper-muted !via-paper !to-paper-muted" />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="space-y-3 rounded-3xl border border-paper-muted/40 bg-paper px-5 py-5" aria-busy>
      <Skeleton className="h-4 w-28 !from-paper-muted !via-paper !to-paper-muted" />
      <Skeleton className="h-10 w-40 !from-paper-muted !via-paper !to-paper-muted" />
      <Skeleton className="h-4 w-36 !from-paper-muted !via-paper !to-paper-muted" />
    </div>
  );
}

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

export function InlineLoader({ className, label = 'Updating…' }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-6 text-[13px] font-medium text-cream/50', className)} role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" aria-hidden />
      {label}
    </div>
  );
}
