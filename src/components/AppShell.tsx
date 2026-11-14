import type { CSSProperties, ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, CircleUserRound, Inbox as InboxIcon, Users, WifiOff } from 'lucide-react';
import { LogoMark } from '@/components/Brand';
import { PageEnter } from '@/components/motion';
import { useInbox } from '@/hooks/useProposals';
import { useOnline } from '@/hooks/useBrowser';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/format';

/**
 * Mobile-first frame (§6 design target: 390px; desktop is a centered column).
 * Conventions match consumer finance apps: sticky header, bottom tabs,
 * primary actions in the thumb zone, logo on root tabs.
 */
export function AppShell({
  title,
  back,
  action,
  children,
  nav = true,
  fab,
}: {
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
    <div
      className="app-frame"
      style={{ '--nav-h': nav ? '64px' : '0px' } as CSSProperties}
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-white px-4 py-2 font-semibold text-brand shadow-float focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {title !== undefined && (
        <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-canvas/90 shadow-header backdrop-blur-xl safe-top">
          <div className={cn('flex items-center gap-1 px-2', root ? 'h-16 pl-4 pr-3' : 'h-14')}>
            {back && (
              <button
                type="button"
                onClick={() => (back === true ? navigate(-1) : navigate(back))}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-white/80"
                aria-label="Back"
              >
                <ChevronLeft size={24} aria-hidden />
              </button>
            )}

            <h1
              className={cn(
                'min-w-0 flex-1 truncate font-semibold text-ink',
                root ? 'text-[22px]' : 'text-[17px]',
              )}
            >
              {root ? (
                <span className="inline-flex max-w-full items-center gap-2.5">
                  <LogoMark size={30} className="shadow-soft" />
                  <span className="truncate">{title}</span>
                </span>
              ) : (
                title
              )}
            </h1>

            {action && <div className="flex shrink-0 items-center gap-0.5">{action}</div>}
          </div>
        </header>
      )}

      {!online && (
        <div
          className="flex items-center justify-center gap-2 bg-pending-soft px-4 py-2.5 text-[13px] font-medium text-pending"
          role="status"
        >
          <WifiOff size={15} aria-hidden /> {t('offline.banner')}
        </div>
      )}

      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'flex flex-1 flex-col outline-none',
          nav ? (fab ? 'pb-44' : 'pb-28') : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        )}
      >
        <PageEnter className="flex flex-1 flex-col gap-6 px-4 pt-5">
          {children}
        </PageEnter>
      </main>

      {fab}
      {nav && <BottomNav />}
    </div>
  );
}

function BottomNav() {
  const inbox = useInbox();
  const t = useT();
  const location = useLocation();
  const count = inbox.data?.length ?? 0;
  const items = [
    {
      to: '/groups',
      label: t('nav.groups'),
      icon: Users,
      tour: 'nav-groups',
      match: (p: string) =>
        p.startsWith('/groups') || p.startsWith('/join') || p.startsWith('/explain'),
    },
    {
      to: '/proposals',
      label: t('nav.inbox'),
      icon: InboxIcon,
      tour: 'nav-inbox',
      badge: count,
      match: (p: string) => p.startsWith('/proposals'),
    },
    {
      to: '/me',
      label: t('nav.me'),
      icon: CircleUserRound,
      tour: 'nav-me',
      match: (p: string) => p.startsWith('/me'),
    },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t border-slate-200/80 bg-white/95 shadow-nav backdrop-blur-xl safe-bottom"
    >
      <div className="flex h-16">
        {items.map(({ to, label, icon: Icon, tour, badge, match }) => {
          const active = match(location.pathname);
          return (
            <NavLink
              key={to}
              to={to}
              data-tour={tour}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'pressable relative flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold tracking-wide',
                active ? 'text-brand' : 'text-slate-500',
              )}
            >
              <span
                className={cn(
                  'relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200',
                  active && 'bg-brand-soft',
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {!!badge && (
                  <span
                    className="absolute right-1.5 top-0 min-w-[18px] rounded-full bg-owe px-1 text-center text-[11px] font-bold leading-[18px] text-white ring-2 ring-white"
                    aria-label={`${badge} waiting for you`}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {label}
              {active && (
                <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand" aria-hidden />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
