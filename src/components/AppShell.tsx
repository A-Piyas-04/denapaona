import type { CSSProperties, ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ChevronLeft, CircleUserRound, Inbox as InboxIcon, Users, WifiOff } from 'lucide-react';
import { useInbox } from '@/hooks/useProposals';
import { useOnline } from '@/hooks/useBrowser';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/format';

/**
 * Mobile-first frame (§6 design target: 390px; desktop is a centered column,
 * not a separate layout).  Bottom nav carries the inbox badge — the baseline
 * notification mechanism (§13.3).
 */
export function AppShell({ title, back, action, children, nav = true, fab }: {
  title?: ReactNode;
  back?: string | true;
  action?: ReactNode;
  children: ReactNode;
  /** Hide the bottom nav on focused tasks (forms), so the primary action owns the bottom. */
  nav?: boolean;
  fab?: ReactNode;
}) {
  const navigate = useNavigate();
  const online = useOnline();
  const t = useT();
  const root = !back;
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-app flex-col bg-canvas sm:border-x sm:border-slate-200/70"
         style={{ '--nav-h': nav ? '64px' : '0px' } as CSSProperties}>
      {title !== undefined && (
        <header className={cn('sticky top-0 z-30 flex items-center gap-1 border-b border-slate-200/70 bg-canvas/90 px-2 backdrop-blur-md',
                              root ? 'h-16 pl-5' : 'h-14')}>
          {back && (
            <button
              type="button"
              onClick={() => (back === true ? navigate(-1) : navigate(back))}
              className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-800 hover:bg-slate-200/70"
              aria-label="Back"
            >
              <ChevronLeft size={24} aria-hidden />
            </button>
          )}
          <h1 className={cn('min-w-0 flex-1 truncate font-semibold text-slate-900', root ? 'text-[24px]' : 'text-[17px]')}>{title}</h1>
          {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
        </header>
      )}
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-pending-soft px-4 py-2 text-[13px] font-medium text-pending" role="status">
          <WifiOff size={15} aria-hidden /> {t('offline.banner')}
        </div>
      )}
      <main className={cn('flex flex-1 flex-col gap-6 px-4 pt-5', nav ? (fab ? 'pb-40' : 'pb-24') : 'pb-6')}>{children}</main>
      {fab}
      {nav && <BottomNav />}
    </div>
  );
}

function BottomNav() {
  const inbox = useInbox();
  const t = useT();
  const count = inbox.data?.length ?? 0;
  const items = [
    { to: '/groups', label: t('nav.groups'), icon: Users, tour: 'nav-groups' },
    { to: '/proposals', label: t('nav.inbox'), icon: InboxIcon, tour: 'nav-inbox', badge: count },
    { to: '/me', label: t('nav.me'), icon: CircleUserRound, tour: 'nav-me' },
  ];
  return (
    <nav aria-label="Main"
         className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-app border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-nav backdrop-blur-md">
      {items.map(({ to, label, icon: Icon, tour, badge }) => (
        <NavLink key={to} to={to} data-tour={tour}
                 className={({ isActive }) => cn('flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[12px] font-semibold',
                   isActive ? 'text-brand' : 'text-slate-500 hover:text-slate-800')}>
          {({ isActive }) => (
            <>
              <span className={cn('relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200',
                                  isActive && 'bg-brand-soft')}>
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
                {!!badge && (
                  <span className="absolute right-1.5 top-0 min-w-[18px] rounded-full bg-owe px-1 text-center text-[11px] font-bold leading-[18px] text-white ring-2 ring-white"
                        aria-label={`${badge} waiting for you`}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Kept for screens that still use the older name; prefer `Section` from ui. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-[15px] font-semibold text-slate-900">{children}</h2>
      {action}
    </div>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="text-sm font-semibold text-brand hover:underline">{children}</Link>;
}
