import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useInbox } from '@/hooks/useProposals';
import { useOnline } from '@/hooks/useBrowser';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/format';

/**
 * Mobile-first frame (§6 design target: 390px; desktop is a centered column,
 * not a separate layout).  Bottom nav carries the inbox badge — the baseline
 * notification mechanism (§13.3).
 */
export function AppShell({ title, back, action, children }: {
  title?: ReactNode; back?: string | true; action?: ReactNode; children: ReactNode;
}) {
  const navigate = useNavigate();
  const online = useOnline();
  const t = useT();
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-app flex-col bg-slate-50">
      {!online && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900" role="status">{t('offline.banner')}</div>
      )}
      {title !== undefined && (
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur">
          {back ? (
            <button
              onClick={() => (back === true ? navigate(-1) : navigate(back))}
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
              aria-label="Back"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          ) : <span className="w-2" />}
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-slate-900">{title}</h1>
          {action}
        </header>
      )}
      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const inbox = useInbox();
  const t = useT();
  const count = inbox.data?.length ?? 0;
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs';
  const cls = ({ isActive }: { isActive: boolean }) => cn(item, isActive ? 'text-brand' : 'text-slate-500');
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-16 max-w-app border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <NavLink to="/groups" className={cls}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5c2.6.2 4.6 2 5.5 5" /></svg>
        {t('nav.groups')}
      </NavLink>
      <NavLink to="/proposals" className={cls}>
        <span className="relative">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 13h4l2 3h4l2-3h4" /><path d="M5 5h14l1 8v6H4v-6z" /></svg>
          {count > 0 && (
            <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-owe px-1 text-center text-[11px] font-semibold leading-[18px] text-white"
                  aria-label={`${count} waiting for you`}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </span>
        {t('nav.inbox')}
      </NavLink>
      <NavLink to="/me" className={cls}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>
        {t('nav.me')}
      </NavLink>
    </nav>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      {action}
    </div>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="text-sm font-medium text-brand hover:underline">{children}</Link>;
}
